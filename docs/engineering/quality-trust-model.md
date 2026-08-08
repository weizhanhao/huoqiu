# Quality gate trust model

The quality commands in this repository are useful locally, but a local run is
not a certification boundary. Candidate code, the local environment, evidence
files, and local Git metadata share one privilege level and can all be changed
by the same user. A certifying run must therefore use the external trust
boundary described below.

## Production trust chain

1. A protected launcher runs a pinned verifier distribution outside the
   candidate checkout. The verifier resolves and hashes its actual executing
   entrypoint, requires that entrypoint to equal the protected absolute path,
   and rejects an entrypoint inside the candidate repository. The protected
   system injects the repository ID, exact current-registry digest, accepted
   registry epoch, previous-registry digest for epochs after 1, root Ed25519
   SPKI, and root key ID. Candidate-provided `HUOQIU_*` variables are not a
   substitute for this external boundary.
2. The root key verifies `quality/reviewers/trust-registry.v2.json`. Registry
   v2 binds the trust domain, immutable repository ID, actual verifier digest,
   protected execution-launcher digest, epoch, previous-registry digest,
   expiry, key roles, exact workflow provenance, and public keys. The verifier
   also compares the exact registry file bytes with the protected digest pin,
   preventing same-epoch substitution. The committed registry is intentionally
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
hashes its actual bytes before and after execution, and matches that digest to
both protected configuration and the root-signed registry. It also requires
the exact isolation profile
`container-v1:no-network,read-only-source,owned-process-tree`. Absence or any
mismatch fails before candidate code runs.

The trusted external launcher is responsible for implementing that profile
with an OS security boundary (for example, a no-network container with a
read-only source mount and a cgroup, namespace, or Windows Job Object that owns
the complete process tree). The verifier creates a temporary detached worktree
at the exact commit; the launcher runs the requested command inside the
protected view of that workspace and returns the closed v1 result envelope.
The verifier additionally:

- rejects dirty trees, symlinks/submodules, and tracked files hidden with
  `assume-unchanged` or `skip-worktree`;
- hashes path, mode, and bytes for every tracked regular file;
- requests `pnpm install --offline --frozen-lockfile
--strict-peer-dependencies` inside the protected boundary when a package and
  lockfile are present, honoring the tracked workspace build allowlist;
- watches tracked paths for writes (including modify-then-restore attacks),
  recomputes the source digest afterward, and discards the worktree; and
- rejects shell/wrapper executables, strips caller secrets and hostile `GIT_*`
  state, kills the launched process group on every exit path, and rejects
  skipped/TODO/FIXME/no-test results or caller-supplied raw reports.

The repository test suite uses a byte-pinned protocol harness to test this
handshake. That harness is not a production isolation implementation and must
never be used as certification evidence. The file watchers and post-run hash
are defense in depth; only the protected OS launcher establishes no-network,
read-only-source, and complete descendant cleanup guarantees.

The protected oracle contains both the exact required capability order and the
exact set currently allowed to report `NOT_IMPLEMENTED`. Updating either set
requires a verifier/oracle release; a manifest alone cannot downgrade a gate.

## Operational sequence

The protected system supplies all root, registry, repository, actual-verifier,
execution-launcher, authorship-archive, workflow-provenance, and signing-key
variables. For authorship, `HUOQIU_AUTHORSHIP_ARCHIVE_B64` is the exact
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
