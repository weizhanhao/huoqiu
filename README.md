# 火球

火球是一个 pnpm + Turborepo Monorepo。应用位于 `apps/*`，共享包位于
`packages/*`。

## Prerequisites

- Node.js 24.15.0（`nvm use`）
- pnpm 11.4.0

## Getting started

```bash
nvm use
pnpm install
pnpm dev
```

Run the workspace checks with `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build`, and `pnpm format:check`.

Loopback-only, access-protected continuous previews are documented in
[`apps/preview/README.md`](apps/preview/README.md). Preview responses are
explicitly labeled with synthetic-data and review-status headers.

The certification boundary, signed authorship/review chain, and detached
execution invariants are documented in
[`docs/engineering/quality-trust-model.md`](docs/engineering/quality-trust-model.md).

## Web release activation

Production builds must not overwrite `apps/web/.next` while the service is
running. Build the candidate as the `huoqiu` service user with the protected
runtime environment and `pnpm --filter @huoqiu/web build:release`, stamp that
candidate as documented in `apps/preview/README.md`, then activate it with
`sudo scripts/release/activate-web-build.sh /opt/huoqiu`. Activation
stops the service, switches the completed build with same-filesystem renames,
starts the service, and restores the previous build automatically if startup
fails. It never stores or prints deployment credentials.
