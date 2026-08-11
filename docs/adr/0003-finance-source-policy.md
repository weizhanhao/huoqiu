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
snapshot with partial data. The safe default is one fetch attempt. A connector
may classify a source error and attach a typed `never`, audited backoff, or
provider-specified retry-after instruction; untyped errors and access-denied
responses do not retry. Rate-limit instructions cannot request a short retry,
and neither upstream error details nor cursor contents enter degraded output.

GDELT's approved primary transport is the fixed GCS HTTPS path-style prefix
`https://storage.googleapis.com/data.gdeltproject.org/gdeltv2/`, with normal
TLS certificate verification and redirects treated as errors. Direct GDELT
HTTP is rejected in every public-display path, including local preview; there
is no automatic HTTP fallback. The GDELT DOC HTTPS endpoint is supplementary,
and BigQuery is a Phase 2 option. A connector must persist its HTTPS transport
kind/base URL, TLS policy, and redirect policy in the fixed provenance
snapshot. Public-display descriptors cannot claim plaintext transport even
when a checksum is available.

Every user-visible link and upstream base URL is canonical public HTTPS on the
default port. Credentials, fragments, IP literals, loopback/private/reserved
addresses, localhost, single-label names, and private-use suffixes such as
`.local` are rejected at the normalized contract. Connector-specific host and
path allowlists remain mandatory where a source has a documented fixed origin;
the foundation does not use DNS resolution as a substitute for that policy.

Free access is not evidence of external-display or redistribution rights.
Tushare, AKShare, Alpha Vantage, and Finnhub free tiers are therefore excluded
from the protected public preview. A-share, H-share, and US equity quotes stay
on the deterministic synthetic provider until a contract explicitly permits
the required use.

Each normalized record carries a fixed provenance snapshot:

- source, source mode, source URL, publisher, publication/fetch timestamps,
  entitlement, license label/URL/scope, attribution, and delay;
- official-source flag, authentication type, market, languages, history start,
  source capabilities, native cadence, minimum poll interval, staleness
  threshold, documented/configured rate limits, and raw-retention days;
- robots policy/check URL/check time and HTTPS transport kind/base URL, TLS
  verification, and redirect policy;
- external-display, body-storage, image-storage, redistribution,
  transformation, and attribution-required flags;
- license/terms verification timestamps and a stable license snapshot ID;
- a deterministic hash over normalized content and the complete provenance
  snapshot, so a source correction or rights-policy revision becomes an update
  instead of an accidental duplicate.

The closed license scopes are `public-reuse`, `open-attribution`,
`metadata-linkout-only`, `internal-nondisplay`, `external-display-contract`,
`redistribution-contract`, and `unknown-blocked`. Real records fail closed
unless external display is explicitly allowed under a display-capable scope.
`unknown-blocked` and `internal-nondisplay` records never enter display-ready
output. `metadata-linkout-only` always means external display and attribution
are required while body storage, image storage, redistribution, and content
transformation are forbidden. `open-attribution` requires attribution but can
represent an official numeric release whose verified artifact rights allow
redistribution without body, image, or transformation rights. Any descriptor
whose booleans contradict the closed scope matrix fails before fetching.

The first public snapshot projection is metadata-only: title, typed publisher,
published time, canonical source URL, language, topics, and permitted symbols.
It excludes body, summary, excerpt, and image fields even if a future storage
agreement permits them internally. Record attributes are a strict, bounded
allowlist of typed financial metadata; unknown, nested, array, body, summary,
HTML, and image aliases fail normalization instead of being copied or filtered
by a bypassable denylist.

## Consequences

Provider adapters remain private and replaceable; the normalized contract and
store port contain no vendor-specific fields. Atomic JSON snapshot storage and
the server-side public snapshot reader are separate follow-up slices. Any new
provider, broader field projection, quote source, or changed license terms
requires an updated verified license snapshot and independent review before it
can be promoted to the stable preview.
