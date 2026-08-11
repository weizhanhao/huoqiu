# ADR 0003: Finance source and display policy

- Status: Accepted
- Date: 2026-08-12

## Context

Huoqiu needs real finance metadata in previews without treating free network
access as permission to redistribute content. Provider terms can separately
control fetching, storage, transformation, attribution, and external display.
Those decisions must be reviewable at the record revision that reached a
public snapshot.

## Decision

Phase 1 connector order is fixed:

1. SEC EDGAR filing metadata and source links (`public-reuse`).
2. GDELT news metadata and publisher link-outs
   (`metadata-linkout-only`; no article body, summary, excerpt, or image).
3. National Bureau of Statistics macro-release metadata and source links
   (`open-attribution`).

Connectors run only on the server. They normalize through the public ingestion
port, persist through a replaceable atomic store, and never expose upstream
keys or raw responses to Web or mobile clients. SEC requests must identify the
application with an operator contact and remain at or below 10 requests per
second. Every source declares its native cadence, minimum polling interval, and
staleness threshold; the scheduler must not poll faster than the declared
minimum. A failed run retries a bounded number of times, returns a sanitized
stage-specific degraded result, and must not replace a previously valid
snapshot with partial data. The retry policy receives the upstream error so a
connector can stop immediately for non-retryable responses or apply an audited
provider delay without exposing that error in the run result.

Free access is not evidence of external-display or redistribution rights.
Tushare, AKShare, Alpha Vantage, and Finnhub free tiers are therefore excluded
from the protected public preview. A-share, H-share, and US equity quotes stay
on the deterministic synthetic provider until a contract explicitly permits
the required use.

Each normalized record carries a fixed provenance snapshot:

- source, source mode, source URL, publisher, publication/fetch timestamps,
  entitlement, license label/URL/scope, attribution, and delay;
- official-source flag, source capabilities, native cadence, minimum poll
  interval, staleness threshold, and raw-retention days;
- external-display, body-storage, redistribution, transformation, and
  attribution-required flags;
- license/terms verification timestamps and a stable license snapshot ID;
- a deterministic hash over normalized content and the complete provenance
  snapshot, so a source correction or rights-policy revision becomes an update
  instead of an accidental duplicate.

The closed license scopes are `public-reuse`, `open-attribution`,
`metadata-linkout-only`, `internal-nondisplay`, `external-display-contract`,
`redistribution-contract`, and `unknown-blocked`. Real records fail closed
unless external display is explicitly allowed under a display-capable scope.
`unknown-blocked` and `internal-nondisplay` records never enter display-ready
output. When body storage is disallowed, normalization rejects summaries and
excerpts, plus body/media aliases hidden in free-form attributes, rather than
silently retaining them.

The first public snapshot projection is metadata-only: title, typed publisher,
published time, canonical source URL, language, topics, and permitted symbols.
It excludes body, summary, excerpt, and image fields even if a future storage
agreement permits them internally.

## Consequences

Provider adapters remain private and replaceable; the normalized contract and
store port contain no vendor-specific fields. Atomic JSON snapshot storage and
the server-side public snapshot reader are separate follow-up slices. Any new
provider, broader field projection, quote source, or changed license terms
requires an updated verified license snapshot and independent review before it
can be promoted to the stable preview.
