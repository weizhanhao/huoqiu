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
