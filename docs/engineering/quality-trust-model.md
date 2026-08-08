# Quality gate trust model

The quality commands in this repository are useful locally, but a local run is
not a certification boundary. Candidate code, the local environment, evidence
files, and local Git metadata share one privilege level and can all be changed
by the same user. A certifying run must therefore use the external trust
boundary described below.

## Production trust chain

1. A protected launcher runs a pinned verifier distribution outside the
   candidate checkout. It injects the verifier digest, repository ID, accepted
   registry epoch, root Ed25519 SPKI, and root key ID. Candidate-provided
   `HUOQIU_*` variables are not a substitute for that launcher.
2. The root key verifies `quality/reviewers/trust-registry.v2.json`. Registry
   v2 binds the trust domain, immutable repository ID, verifier digest, epoch,
   previous-registry digest, expiry, key roles, exact workflow provenance, and
   public keys. The committed registry is intentionally unsigned and empty, so
   an unconfigured production run fails closed.
3. A protected external authorship attestor derives canonical `github:<id>`
   implementer identities from an archived, independently obtained input. It
   signs `authorship.v1.json` with an `authorship`-role key. The signature binds
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
`external-attestor-v1`; a future GitHub API policy must archive and bind the
exact API response bytes before it can be accepted.

## Secret-handling invariant

Signer jobs validate the clean tracked source, registry, context, evidence,
raw reports, and checklist before loading a private signing key. After the key
enters memory, they do not execute candidate commands. The signer runtime and
its dependencies must come from the protected pinned verifier distribution,
not from a candidate-controlled install.

## Capability execution

Capability commands run in a temporary detached worktree at the exact commit.
The runner:

- rejects dirty trees, symlinks/submodules, and tracked files hidden with
  `assume-unchanged` or `skip-worktree`;
- hashes path, mode, and bytes for every tracked regular file;
- installs with `pnpm install --offline --frozen-lockfile
--strict-peer-dependencies` when a package and lockfile are present, honoring
  the tracked workspace build allowlist;
- watches tracked paths for writes (including modify-then-restore attacks),
  recomputes the source digest afterward, and discards the worktree; and
- rejects skipped/TODO/FIXME/no-test results and caller-supplied raw reports.

The protected oracle contains both the exact required capability order and the
exact set currently allowed to report `NOT_IMPLEMENTED`. Updating either set
requires a verifier/oracle release; a manifest alone cannot downgrade a gate.

## Operational sequence

The protected system supplies all root, registry, repository, verifier,
authorship-input, workflow-provenance, and signing-key variables. It then runs:

```text
quality:record-authorship --milestone <d0|m1> --commit-sha <HEAD> \
  --implementer-id github:<id> [...]
quality:record-review --milestone <d0|m1> --commit-sha <HEAD> [--dimension release]
gate:d0 | gate:m1
```

Artifacts are uploaded to immutable storage. Any new source/config commit or
any changed evidence byte invalidates the chain and requires regeneration.
