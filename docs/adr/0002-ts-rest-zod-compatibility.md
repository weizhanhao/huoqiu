# ADR 0002: Isolate ts-rest and Zod compatibility

- Status: Accepted
- Date: 2026-08-09

## Context

M1 contracts use stable `@ts-rest/core@3.52.1`. Its published peer range is
`zod@^3.22.3`, while the existing D0, shared error, pagination, and feed-card
contracts are pinned to Zod 4.4.3.

A strict TypeScript 6.0.3 check without `skipLibCheck` confirms that wiring
ts-rest 3.52.1 directly to Zod 4 fails in ts-rest's declarations. The failures
include Zod 3-only types such as `AnyZodObject`, `ZodEffects`, and `objectUtil`.
The available `3.53.0-rc.1` package is not stable and still exposes legacy Zod
type references in its declarations, so adopting the release candidate would
not provide an approved or verified exit.

## Decision

`packages/contracts` contains a temporary compatibility island:

- M1 ts-rest contracts import `zod@3.25.76`, which is inside ts-rest 3.52.1's
  official peer range.
- Existing D0, shared, and feed contracts import the `zod4` npm alias pinned to
  `zod@4.4.3`; their public behavior remains unchanged.
- Zod schema instances must not cross the boundary. M1 route schemas and their
  nested schemas are Zod 3; existing schemas remain Zod 4.
- The contracts typecheck covers both islands and must pass without
  `skipLibCheck`.

## Consequences and exit criteria

The package temporarily carries two exact Zod versions and a boundary test.
The island may be removed only after a stable ts-rest release supports Zod 4
natively and the replacement passes the Task 2 OpenAPI and SDK generation
gates, strict typechecking, and the complete contract test suite.
