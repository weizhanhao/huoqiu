# Local continuous preview

This package is a loopback-only gateway for reviewing a built 火球 Web artifact.
It is not a production deployment path. The current gateway labels every
response `synthetic` and `unreviewed`, blocks indexing, requires HTTP Basic
authentication, and creates the Web Zero Trust proof in memory.

## Build and stamp the product artifact

Build only code whose product SHA is eligible for the intended preview. Then
stamp the ignored build directory with that exact SHA:

```bash
pnpm --filter @huoqiu/web build
PREVIEW_PRODUCT_SHA=<40-character-approved-product-sha> \
  pnpm --filter @huoqiu/preview stamp:product
```

The start command fails closed if `.next/BUILD_ID` is absent or the stamp does
not exactly match `PREVIEW_PRODUCT_SHA`.

## Start a temporary local preview

```bash
APP_ENV=local \
PREVIEW_BASIC_USERNAME=<temporary-username> \
PREVIEW_BASIC_PASSWORD=<temporary-visible-ASCII-password> \
PREVIEW_PRODUCT_SHA=<stamped-product-sha> \
PREVIEW_GATEWAY_SHA=<reviewed-or-temporary-gateway-sha> \
pnpm --filter @huoqiu/preview start:local
```

The default address is `http://127.0.0.1:4173`; the built Web child is private
on `127.0.0.1:4174`. Only the exact numeric loopback bind is accepted. Ports
may be changed with `--port` and `--web-port`, but no upstream host option
exists. The HMAC secret is randomly generated in memory, passed only to the
Web child, and is never written or printed. The Basic password is not passed
to Web and is not printed by the launcher.

The response headers expose the product SHA, gateway SHA, synthetic-data flag,
and review status. A stable preview must still be launched from independently
approved code; this package does not promote `unreviewed` code to stable.
