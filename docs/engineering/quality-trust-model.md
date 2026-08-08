# Quality gate trust model

The quality commands in this repository are useful locally, but a local run is
not a certification boundary. Candidate code, the local environment, evidence
files, and local Git metadata share one privilege level and can all be changed
by the same user. A certifying run must therefore use the external trust
boundary described below.

## Production trust chain

1. A protected launcher runs a pinned verifier distribution outside the
   candidate checkout. The verifier binds one domain-separated digest to both
   its actual bootstrap entrypoint and the loaded, built-in-only verifier core;
   both are opened without following the leaf path, checked for trusted
   ownership and permissions, measured through stable file handles, and
   required to live outside the candidate repository. The protected system
   injects the repository ID, exact current-registry digest, accepted registry
   epoch, exact raw registry history for epochs after 1, the N-1 digest, root
   Ed25519 SPKI, and root key ID. Candidate-provided `HUOQIU_*` variables are
   not a substitute for this external boundary.
2. The root key verifies `quality/reviewers/trust-registry.v2.json`. Registry
   v2 binds the trust domain, immutable repository ID, actual verifier digest,
   protected execution-launcher digest, epoch, previous-registry digest,
   expiry, key roles, exact workflow provenance, and public keys. The verifier
   also compares the exact registry file bytes with the protected digest pin,
   preventing same-epoch substitution. For epoch N, it verifies every
   root-signed raw registry from 1 through N-1, including repository,
   trust-domain, epoch, and byte-digest linkage; a matching N-1 string without
   those bytes is insufficient. The committed registry is intentionally
   unsigned and empty, so an unconfigured production run fails closed.
3. A protected external authorship attestor derives canonical `github:<id>`
   implementer identities from exact archived bytes obtained independently of
   the candidate. The protected channel supplies the canonical-base64 archive
   and its SHA-256; the verifier hashes those bytes, validates
   `authorship-input.schema.json`, checks repository/base/HEAD context, and
   deterministically derives the sorted identity set. The CLI accepts no
   caller-supplied implementer IDs. The attestor signs `authorship.v1.json`
   with an `authorship`-role key. The signature binds
   repository ID, trusted base, exact HEAD and tree, canonical binary diff,
   tracked-source digest, registry digest, derivation policy, archived input
   digest, implementer set, time, and full issuer provenance. Manifest
   `implementer_ids` are checked against this statement; they are never their
   own authority.
4. A different protected principal and different key perform review. Review v3
   signs the current source/contract/fixture/config context, root and registry
   identity, authorship statement bytes, the complete evidence/raw-report byte
   set, checklist, implementers, findings, time, and reviewer provenance.
5. Final verification recomputes every bound digest and rejects missing,
   expired, stale, malformed, self-issued, same-key, or unauthorized artifacts.

The authorship attestor, implementers, and reviewer must be distinct where
their roles overlap. The authorship derivation policy is currently
`external-attestor-v1`. Its protected archive contains immutable GitHub actor
IDs, not mutable logins. A future GitHub API policy must define and archive the
exact response bytes before it can be accepted.

## Secret-handling invariant

Signer jobs validate the clean tracked source, registry, context, evidence,
raw reports, and checklist before loading a private signing key. After the key
enters memory, they do not execute candidate commands. The signer runtime and
its dependencies must come from the protected pinned verifier distribution,
not from a candidate-controlled install.

## Capability execution

The repository verifier does not directly execute a capability command. It
first requires an absolute, executable launcher outside the candidate tree,
opens and measures a non-symlink, singly-linked launcher with trusted ownership
and permissions, and matches that digest to both protected configuration and
the root-signed registry. The measured launcher source must be a self-contained
built-in-only module. The verifier executes those already-measured bytes via
the trusted runtime rather than reopening the launcher path, then checks that
the path still names the same filesystem identity. It also requires the exact
isolation profile
`container-v1:no-network,read-only-source,owned-process-tree`. Absence or any
mismatch fails before candidate code runs.

The trusted external launcher is responsible for implementing that profile
with an OS security boundary (for example, a no-network container with a
read-only source mount and a cgroup, namespace, or Windows Job Object that owns
the complete process tree). After checking a clean index and tracked-source
digest, the verifier copies only singly-linked tracked regular files through
stable handles into a new private snapshot. It never performs a candidate Git
checkout, so repository-local hooks and clean/smudge filters cannot execute
during snapshot creation. The launcher runs the requested command inside the
protected view of that snapshot and returns the closed v1 result envelope. The
verifier additionally:

- rejects dirty trees, symlinks/submodules, and tracked files hidden with
  `assume-unchanged` or `skip-worktree`;
- hashes path, mode, and bytes for every tracked regular file;
- requests `pnpm install --offline --frozen-lockfile
--strict-peer-dependencies` inside the protected boundary when a package and
  lockfile are present, honoring the tracked workspace build allowlist;
- watches tracked paths for writes (including modify-then-restore attacks),
  recomputes the source digest afterward, and discards the snapshot;
- invokes a fixed absolute, trusted system Git with a fixed system `PATH`, no
  global/system configuration, disabled hooks, and disabled fsmonitor for the
  small set of read-only context operations;
- rejects direct and `pnpm exec` shell wrappers plus Node eval/print forms,
  strips caller secrets and hostile `GIT_*` state, kills the launched process
  group on every exit path, and performs ownership-token and new-workspace-PID
  cleanup as defense in depth; and
- rejects skipped/TODO/FIXME/no-test results or caller-supplied raw reports.

The repository test suite uses a byte-pinned protocol harness to test this
handshake. That harness is not a production isolation implementation and must
never be used as certification evidence. Process groups, ownership-token and
workspace scans, file watchers, and post-run hashes are defense in depth; only
the protected OS launcher establishes no-network, read-only-source, and
complete descendant cleanup guarantees. In particular, an environment token
is not treated as the kernel ownership boundary.

The protected oracle contains both the exact required capability order and the
exact set currently allowed to report `NOT_IMPLEMENTED`. Updating either set
requires a verifier/oracle release; a manifest alone cannot downgrade a gate.

## Operational sequence

The protected system supplies all root, registry, repository, actual-verifier,
execution-launcher, authorship-archive, workflow-provenance, and signing-key
variables. For epoch N greater than 1,
`HUOQIU_TRUST_REGISTRY_HISTORY_B64` is canonical base64 of a JSON array whose
items are canonical base64 for the exact raw registry bytes from epochs 1
through N-1. For authorship, `HUOQIU_AUTHORSHIP_ARCHIVE_B64` is the exact
canonical-base64 archive and `HUOQIU_AUTHORSHIP_INPUT_SHA256` is the SHA-256 of
those decoded bytes. It then runs:

```text
quality:record-authorship --milestone <d0|m1> --commit-sha <HEAD>
quality:record-review --milestone <d0|m1> --commit-sha <HEAD> [--dimension release]
gate:d0 | gate:m1
```

The repository-local TypeScript entrypoints are diagnostic tools. Because a
certifying verifier and execution launcher must both be protected artifacts
outside the candidate checkout, an ordinary local invocation intentionally
cannot self-certify and fails closed without those prerequisites.

Artifacts are uploaded to immutable storage. Any new source/config commit or
any changed evidence byte invalidates the chain and requires regeneration.
