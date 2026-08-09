# D0 certification bootstrap

D0 certification is deliberately fail closed. The repository can produce
diagnostic test output, but a source checkout cannot create its own trusted
identity, protected process boundary, or certification signature.

## External prerequisites

Repository administrators must provision all of the following outside the
candidate checkout before `.github/workflows/d0-quality-review.yml` can pass:

1. Replace every `pending:capability-implementation` manifest value with the
   verified implementer's canonical `github:<numeric-id>`. Do not infer an ID
   from a login, display name, commit email, or local Git configuration.
2. Install the pinned verifier distribution and execution launcher on a
   dedicated self-hosted runner labelled `huoqiu-quality`. Register their exact
   digests, paths, repository ID, root public key, registry epoch, and isolation
   profile as protected environment variables. The runner must provide the
   no-network, read-only-source, complete-process-tree boundary described in
   `docs/engineering/quality-trust-model.md`; there is no local fallback.
3. Create two different Ed25519 key pairs outside the repository: one for the
   authorship attestor and one for the independent reviewer. Register only the
   public keys and exact GitHub Actions provenance in the root-signed
   `quality/reviewers/trust-registry.v2.json`. Each policy must bind the SHA-256
   of `.github/workflows/d0-quality-review.yml` and the appropriate protected
   environment (`quality-authorship` or `quality-review`).
4. Store the private keys only in their matching protected environments. The
   authorship environment also receives the immutable external-attestor archive
   and digest. The review environment receives the same archive/digest for
   verification plus a commit-specific independently completed checklist.
5. Configure the `quality-capability`, `quality-authorship`, and
   `quality-review` environments so different protected principals approve the
   latter two jobs. The authorship attestor, capability implementers, and
   reviewer must remain distinct as required by the registry roles.

For registry epochs after 1, the protected runner must additionally inject the
complete root-signed registry history and the exact previous-registry digest as
documented by the trust model. These optional rotation values are intentionally
not represented by empty workflow variables because an empty value is not an
absent protected pin.

## Workflow behavior

The workflow accepts an exact candidate SHA and trusted base SHA. It certifies
only when the candidate SHA is also the SHA containing the workflow bytes that
GitHub executed. It then performs three separate jobs:

1. the protected verifier generates all five D0 capability evidence records;
2. the protected authorship principal signs the exact external identity archive
   and candidate context;
3. the independent reviewer materializes its checklist, signs the complete
   evidence set, and runs the final gate.

Signing secrets are scoped only to their signing steps. Candidate commands are
run by the external verifier and launcher, not by repository-local TypeScript
under a private signing key. Every Action is pinned to an immutable commit.

The committed v2 registry is intentionally unsigned with no authorized keys,
and the D0 manifests still contain explicit pending sentinels. Therefore the
repository is not currently externally certifiable. This is an honest external
configuration blocker, not a test pass and not a reason to fabricate IDs,
keys, evidence, or a weaker gate.
