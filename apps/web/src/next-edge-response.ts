// Next 16.3's public `next/server` ESM barrel retains Node-only exports in an
// Edge webpack build. Keep this pinned internal import isolated and covered by
// a dependency-version regression so a Next upgrade must revisit the adapter.
export const NEXT_EDGE_RESPONSE_ADAPTER_VERSION = "16.3.0" as const;

export { NextResponse } from "next/dist/server/web/spec-extension/response";
