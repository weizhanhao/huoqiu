# D0 certification trust bootstrap

D0 certification is deliberately fail closed. A source checkout cannot create a
trusted reviewer identity or sign its own review.

Before the protected workflow can certify a commit, repository administrators
must provide two external identities:

1. Replace each D0 manifest placeholder with the verified implementer's
   `github:<numeric-id>`. Never infer this value from a display name or email.
2. Generate an Ed25519 reviewer key outside the repository. Register only its
   public SPKI PEM and protected GitHub Actions provenance in
   `quality/reviewers/trust-registry.v1.json`. Store the private key only as the
   `HUOQIU_REVIEW_PRIVATE_KEY_B64` secret in the `quality-review` environment.

The protected environment must also provide the registered key ID and a
commit-specific, independently completed D0 checklist as base64 secrets. The
workflow checks out the requested exact SHA, generates capability evidence,
then waits at the protected `quality-review` environment before it can decode
the checklist, sign the byte-bound evidence set, and run `pnpm gate:d0`.

No default test key, private key, reviewer ID, empty checklist, or local
fallback is permitted. Missing implementer identity, public-key registration,
protected provenance, checklist, or private-key secret keeps certification
non-zero and fail closed.
