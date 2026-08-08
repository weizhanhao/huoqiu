# 火球 Wave 0 Monorepo Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可构建、可测试、可并行开发的 Monorepo 基线，让 D0 与 M1 都从同一套工具、设计 token、契约包和质量证据框架出发。

**Architecture:** 根工作区只负责编排；应用代码位于 `apps/*`，共享契约、领域、UI 和测试工具位于 `packages/*`。所有应用先创建最小健康页/健康测试，不包含业务能力；契约 SHA 发布前子代理只读共享包。

**Tech Stack:** Node 24.15、pnpm 11.4、Turborepo 2.10、TypeScript 6.0、tsx 4.23、ESLint 10、Prettier 3.9、Next.js 16.3、Expo 57、NestJS 11、Vitest 4、Playwright 1.62。

## Global Constraints

- 本计划只有主代理写根文件、lockfile、共享包和质量脚本。
- 精确版本写入根 `package.json` 和 lockfile；不得使用未锁定的 git dependency。
- Bootstrap 只创建壳和基础设施，不创建真实交易、私募、AI、Push 或公开组合入口。
- 每个应用在进入下一任务前必须独立通过 typecheck 与最小测试。

---

## Task 1: 固定运行时、工作区与仓库规则

**Files:**

- Modify: `.gitignore`
- Create: `.npmrc`
- Create: `.nvmrc`
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `README.md`

- [ ] **Step 1: 记录当前运行时证据**

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24.15.0
node --version
pnpm --version
git status --short
```

预期包含 `v24.15.0`、`11.4.0`，且只有本计划文件是未提交变化。

- [ ] **Step 2: 写根 package manifest**

```json
{
  "name": "huoqiu",
  "private": true,
  "packageManager": "pnpm@11.4.0",
  "engines": { "node": ">=24.15.0 <25", "pnpm": ">=11.4.0 <12" },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev --parallel",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "format:check": "prettier --check ."
  },
  "devDependencies": {
    "@types/node": "24.13.3",
    "eslint": "10.8.0",
    "prettier": "3.9.6",
    "turbo": "2.10.8",
    "tsx": "4.23.9",
    "typescript": "6.0.3",
    "vitest": "4.1.10"
  }
}
```

- [ ] **Step 3: 写 workspace 与 Turbo pipeline**

`pnpm-workspace.yaml` 的 `packages` 列表只包含 `apps/*` 与 `packages/*`，并以 `onlyBuiltDependencies: [esbuild]` 作为唯一项目级安装脚本批准。pnpm 11 使用 `pnpm approve-builds esbuild` 生成对应的 `allowBuilds.esbuild: true` 单包批准记录；不得批准其他构建脚本或使用临时/全局 minimum-release-age 豁免。`turbo.json` 将 `build` 依赖 `^build`，`lint/typecheck/test` 依赖同名上游任务，`dev` 设为 persistent 且不缓存。

- [ ] **Step 4: 写忽略规则**

保留工作区准备阶段已有的 `.worktrees/`，并忽略 `node_modules`、`.next`、`.expo`、`dist`、`coverage`、`.turbo`、本地 `.env*`、Playwright/Maestro 报告和证据产物；保留 `.env.example` 与 `artifacts/evidence/.gitkeep`。

- [ ] **Step 5: 安装并验证 lockfile**

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24.15.0
pnpm install --frozen-lockfile --force
pnpm exec turbo --version
pnpm exec tsx --version
```

预期 Turbo 输出 `2.10.8`，且 `esbuild` 只因项目内单包 allowlist 执行安装脚本。

- [ ] **Step 6: 提交**

```bash
git add .gitignore .npmrc .nvmrc package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json README.md
git commit -m "chore: bootstrap huoqiu monorepo"
```

## Task 2: 建立共享 TypeScript、Lint 与测试配置

**Files:**

- Create: `packages/config/package.json`
- Create: `packages/config/tsconfig/base.json`
- Create: `packages/config/tsconfig/nextjs.json`
- Create: `packages/config/tsconfig/react-native.json`
- Create: `packages/config/tsconfig/nestjs.json`
- Create: `packages/config/eslint/base.mjs`
- Create: `packages/config/eslint/react.mjs`
- Create: `packages/config/vitest/base.ts`
- Create: `packages/config/src/env.ts`
- Create: `packages/config/test/env.spec.ts`

- [ ] **Step 1: 写环境变量拒绝未知模式的失败测试**

```ts
import { parseRuntimeEnv } from "../src/env";

it("rejects production mode without explicit environment", () => {
  expect(() => parseRuntimeEnv({ NODE_ENV: "production" })).toThrow("APP_ENV");
});
```

- [ ] **Step 2: 运行测试确认模块不存在**

```bash
pnpm --filter @huoqiu/config exec vitest run test/env.spec.ts
```

- [ ] **Step 3: 创建严格基础配置**

`base.json` 启用 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`useUnknownInCatchVariables`、`verbatimModuleSyntax`，并禁止 emit。

- [ ] **Step 4: 实现 Zod 环境解析**

```ts
import { z } from "zod";

const runtimeEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
  APP_ENV: z.enum(["local", "test", "staging", "production"]),
});

export const parseRuntimeEnv = (input: Record<string, unknown>) =>
  runtimeEnvSchema.parse(input);
```

- [ ] **Step 5: 验证并提交**

```bash
pnpm --filter @huoqiu/config test
pnpm --filter @huoqiu/config typecheck
git add packages/config
git commit -m "chore(config): add strict shared tooling"
```

## Task 3: 建立共享核心原语与设计 token

**Files:**

- Create: `packages/domain/package.json`
- Create: `packages/domain/src/shared/ids.ts`
- Create: `packages/domain/src/shared/decimal.ts`
- Create: `packages/domain/src/shared/time.ts`
- Create: `packages/domain/test/shared/decimal.spec.ts`
- Create: `packages/design-tokens/package.json`
- Create: `packages/design-tokens/src/tokens.ts`
- Create: `packages/design-tokens/src/css.ts`
- Create: `packages/design-tokens/assets/huoqiu-mark.svg`
- Create: `packages/design-tokens/assets/demo-avatar.svg`
- Create: `packages/design-tokens/test/tokens.spec.ts`

- [ ] **Step 1: 写定点数和涨跌色失败测试**

```ts
expect(addDecimal("0.1", "0.2")).toBe("0.3");
expect(tokens.market.up).toBe("#F04444");
expect(tokens.market.down).toBe("#16A37A");
expect(tokens.brand.primary).not.toBe("#1976D2");
```

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm --filter @huoqiu/domain test
pnpm --filter @huoqiu/design-tokens test
```

- [ ] **Step 3: 实现 branded IDs 与定点数包装**

```ts
export type Brand<T, Name extends string> = T & { readonly __brand: Name };
export type UserId = Brand<string, "UserId">;
export type ListingId = Brand<string, "ListingId">;
export type PostId = Brand<string, "PostId">;
export type PortfolioId = Brand<string, "PortfolioId">;
```

定点数实现使用字符串输入和 `bigint` scale，不允许 `number` 进入金额、价格或数量构造器。

- [ ] **Step 4: 定义火球视觉 token**

包含品牌主色、表面色、文字层级、红涨绿跌、间距、圆角、阴影、字号和 Web/App 触控最小尺寸；生成 CSS variables，但不复制参考产品品牌蓝或 Logo。

`huoqiu-mark.svg` 与 `demo-avatar.svg` 使用自有几何图形和火焰/轨道意象，不描摹参考产品 Logo 或截图插画。

- [ ] **Step 5: 验证并提交**

```bash
pnpm --filter @huoqiu/domain test
pnpm --filter @huoqiu/design-tokens test
git add packages/domain packages/design-tokens
git commit -m "feat(shared): add core primitives and brand tokens"
```

## Task 4: 创建契约、UI 与测试工具包壳

**Files:**

- Create: `packages/contracts/package.json`
- Create: `packages/contracts/src/index.ts`
- Create: `packages/contracts/src/shared/error.ts`
- Create: `packages/contracts/src/shared/page.ts`
- Create: `packages/contracts/test/shared.spec.ts`
- Create: `packages/testkit/package.json`
- Create: `packages/testkit/src/index.ts`
- Create: `packages/web-ui/package.json`
- Create: `packages/web-ui/src/index.ts`
- Create: `packages/native-ui/package.json`
- Create: `packages/native-ui/src/index.ts`

- [ ] **Step 1: 写统一错误结构和 cursor 测试**

```ts
expect(
  apiErrorSchema.parse({
    code: "VALIDATION_FAILED",
    message: "输入不合法",
    details: { field: "query" },
    trace_id: "trace_test_1",
  }).code,
).toBe("VALIDATION_FAILED");
```

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm --filter @huoqiu/contracts test
```

- [ ] **Step 3: 实现共享契约**

错误码初始集合固定为批准规格的 13 项；`details` 只允许 `field`、`constraint`、`retry_after`、`conflict_version`。cursor Schema 只暴露不透明字符串。

- [ ] **Step 4: 创建 UI 包入口但不放业务 DTO**

Web/native UI 只依赖 `design-tokens`；`testkit` 可以依赖 `contracts`。反向依赖由 `dependency-cruiser` 规则在 M1 foundation 加入。

- [ ] **Step 5: 验证并提交**

```bash
pnpm --filter @huoqiu/contracts test
pnpm --filter @huoqiu/contracts typecheck
git add packages/contracts packages/testkit packages/web-ui packages/native-ui
git commit -m "chore(packages): add shared package shells"
```

## Task 5: 创建 Web 与 Expo 应用壳

**Files:**

- Create: `apps/web/package.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/tests/smoke.spec.tsx`
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/app/index.tsx`
- Create: `apps/mobile/tests/smoke.spec.tsx`

- [ ] **Step 1: 写两个应用的火球品牌 smoke tests**

断言标题为“火球”，并断言页面不包含“雪球”“开户”“认购”“交易下单”。

- [ ] **Step 2: 创建 Next.js 16 App Router 壳**

使用 React Server Components 默认模式；只有交互组件声明 `use client`。根 metadata 使用火球名称和中性投资信息描述。

- [ ] **Step 3: 创建 Expo Router 壳**

Scheme 固定为 `huoqiu`，bundle/package identifier 使用 `com.huoqiu.alpha`；不请求相机、通讯录、定位和推送权限。

- [ ] **Step 4: 验证两个应用**

```bash
pnpm --filter @huoqiu/web test
pnpm --filter @huoqiu/web build
pnpm --filter @huoqiu/mobile test
pnpm --filter @huoqiu/mobile typecheck
pnpm --filter @huoqiu/mobile exec expo export --platform web
```

- [ ] **Step 5: 提交**

```bash
git add apps/web apps/mobile
git commit -m "feat(apps): add web and mobile shells"
```

## Task 6: 创建 API 与 Admin 应用壳

**Files:**

- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`
- Create: `apps/api/src/health/health.controller.ts`
- Create: `apps/api/src/workers/events.main.ts`
- Create: `apps/api/src/workers/market.main.ts`
- Create: `apps/api/test/health.e2e-spec.ts`
- Create: `apps/api/test/workers-smoke.spec.ts`
- Create: `apps/admin/package.json`
- Create: `apps/admin/next.config.ts`
- Create: `apps/admin/src/app/layout.tsx`
- Create: `apps/admin/src/app/page.tsx`
- Create: `apps/admin/tests/smoke.spec.tsx`

- [ ] **Step 1: 写 API health 与 Admin 默认拒绝测试**

`GET /healthz` 返回 `{ "status": "ok" }`；Admin 根页未登录只显示“员工审核入口”，没有审核数据或业务导航。

- [ ] **Step 2: 创建 NestJS/Fastify 壳**

监听地址默认 `127.0.0.1`；启用 helmet、请求 ID、结构化错误 filter 和 1 MiB body limit；业务模块暂不注册。

- [ ] **Step 3: 创建带固定前缀的 Admin 壳**

Admin 使用独立 Next.js 应用，员工准入 guard 在 M1 foundation 实现前默认 deny。`apps/admin/next.config.ts` 必须固定前缀并由 smoke test 断言 `/admin` 与 `/admin/moderation`，不得依赖未登记的外部 rewrite：

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/admin",
  assetPrefix: "/admin",
};

export default nextConfig;
```

- [ ] **Step 4: 创建可独立部署的 worker entrypoints**

`events.main.ts` 和 `market.main.ts` 默认不启动 HTTP server；HTTP `main.ts` 也不得注册队列消费者。Smoke test 分别启动/关闭三个 entrypoint，并断言不会重复注册 consumer。

- [ ] **Step 5: 验证与提交**

```bash
pnpm --filter @huoqiu/api test
pnpm --filter @huoqiu/api build
pnpm --filter @huoqiu/admin test
pnpm --filter @huoqiu/admin build
git add apps/api apps/admin
git commit -m "feat(apps): add api and admin shells"
```

## Task 7: 建立质量 runner 与证据 Schema

**Files:**

- Create: `quality/manifests/d0-required.json`
- Create: `quality/manifests/m1-required.json`
- Create: `quality/oracles/d0-required.json`
- Create: `quality/oracles/m1-required.json`
- Create: `quality/evidence/review.schema.json`
- Create: `quality/evidence/evidence.schema.json`
- Create: `scripts/quality/check-no-skips.mts`
- Create: `scripts/quality/run-capability.mts`
- Create: `scripts/quality/run-gate.mts`
- Create: `scripts/quality/assemble-evidence.mts`
- Create: `scripts/quality/record-review.mts`
- Create: `scripts/quality/test/run-gate.spec.ts`
- Create: `artifacts/evidence/.gitkeep`
- Modify: `package.json`

- [ ] **Step 1: 写 Gate 对范围伪造、旧证据、自审和 skip 失败的测试**

```ts
it.each(["skip", "fixme", "todo", "passWithNoTests"])(
  "rejects %s in required evidence",
  async (marker) => {
    await expect(runGate(fixtureWithMarker(marker))).rejects.toThrow(
      "REQUIRED_TEST_INVALID",
    );
  },
);

it.each([
  ["empty", []],
  ["duplicate", ["CAP-ID-001", "CAP-ID-001"]],
  ["missing", ["CAP-ID-001"]],
  ["extra", ["CAP-ID-001", "CAP-UNKNOWN-999"]],
])("rejects %s Required CAP manifest", async (_name, capIds) => {
  await expect(runGate(fixtureWithCaps(capIds))).rejects.toThrow(
    "REQUIRED_SCOPE_MISMATCH",
  );
});

it.each(["commit_sha", "contract_sha", "fixture_sha", "config_sha"])(
  "rejects stale %s",
  async (field) => {
    await expect(runGate(fixtureWithStaleHash(field))).rejects.toThrow(
      "STALE_EVIDENCE",
    );
  },
);

it("rejects self review", async () => {
  await expect(
    runGate(
      fixtureWithReview({ implementer_ids: ["alice"], reviewer_id: "alice" }),
    ),
  ).rejects.toThrow("INDEPENDENT_REVIEW_REQUIRED");
});
```

- [ ] **Step 2: 运行并确认失败**

```bash
pnpm exec vitest run scripts/quality/test/run-gate.spec.ts
```

- [ ] **Step 3: 写不可由待验 manifest 改写的 Required oracle**

`quality/oracles/d0-required.json` 只包含以下 5 个稳定 ID，`quality/oracles/m1-required.json` 只包含以下 10 个稳定 ID；两份 oracle 由主代理只读维护，Gate 不从 `quality/manifests/*-required.json` 推导期望范围：

`quality/oracles/d0-required.json`：

```json
{
  "milestone": "d0",
  "required_cap_ids": [
    "CAP-ID-001",
    "CAP-INST-001",
    "CAP-MD-001",
    "CAP-FEED-001",
    "CAP-WATCH-001"
  ]
}
```

`quality/oracles/m1-required.json`：

```json
{
  "milestone": "m1",
  "required_cap_ids": [
    "CAP-ID-001",
    "CAP-INST-001",
    "CAP-MD-001",
    "CAP-FEED-001",
    "CAP-WATCH-001",
    "CAP-CONTENT-001",
    "CAP-SOCIAL-001",
    "CAP-NOTIF-001",
    "CAP-MOD-001",
    "CAP-PORT-001"
  ]
}
```

测试逐字断言上述 ID 和顺序，并断言待验 manifest 与 oracle 集合逐项相等、非空、无重复、无额外项；修改 oracle 必须由规格变更和独立品控复核共同批准，不能由被测 manifest 或生成器覆盖。

- [ ] **Step 4: 实现 evidence 与独立复核 Schema**

证据必须包含 `commit_sha`、`base_sha`、`contract_sha`、`fixture_sha`、`config_sha`、`environment`、起止时间、完整命令、Fixture 版本、passed/failed/skipped、原始报告路径及 SHA-256、P0/P1、`implementer_ids`。复核记录必须包含相同 `commit_sha/contract_sha`、`reviewer_id`、复核时间、P0/P1、原始清单路径和签字记录；Schema 拒绝 `reviewer_id` 出现在 `implementer_ids` 中。`record-review.mts` 只能为当前 HEAD 生成记录，从受信员工身份读取 reviewer ID，拒绝命令行覆盖身份，并在写入前完成上述异人检查。

- [ ] **Step 5: 实现绑定当前检出的确定性成功行**

`run-gate.mts` 先读取只读 oracle，再从 manifest 执行子命令、保存 stdout/stderr 和退出码。Gate 必须重新计算 `git rev-parse HEAD`、milestone contract hash、Fixture hash 和 Gate 配置 hash：D0 contract hash 覆盖 `packages/contracts/src/d0` 与共享 Feed Card Schema，M1 contract hash 覆盖 OpenAPI、18 个事件 Schema 和 SDK generated manifest。任一证据或人工复核记录的 SHA 不等于当前值即以 `STALE_EVIDENCE` 失败。只有精确 Required 集合、全部当前证据、独立复核记录存在且零失败/跳过/P0/P1时，才输出 D0/M1 指定成功行。

- [ ] **Step 6: 一次性注册计划套件会调用的根命令**

```json
{
  "qa:cap": "tsx scripts/quality/run-capability.mts",
  "qa:auth-spike": "tsx scripts/quality/auth-spike-gate.mts",
  "qa:boundaries": "tsx scripts/quality/check-boundaries.mts && tsx scripts/quality/check-forbidden-surfaces.mts",
  "qa:contracts": "tsx scripts/quality/contract-gate.mts",
  "qa:ddl": "tsx scripts/quality/ddl-gate.mts",
  "qa:event": "tsx scripts/quality/event-gate.mts",
  "qa:events": "tsx scripts/quality/event-gate.mts",
  "qa:fixtures": "tsx scripts/quality/fixture-gate.mts",
  "qa:navigation": "tsx scripts/quality/navigation-gate.mts",
  "qa:page-states": "tsx scripts/quality/page-state-gate.mts",
  "qa:visual": "tsx scripts/quality/visual-gate.mts",
  "qa:accessibility": "tsx scripts/quality/accessibility-gate.mts",
  "qa:e2e:m1": "tsx scripts/quality/e2e-gate.mts --milestone m1",
  "qa:security": "tsx scripts/quality/security-gate.mts",
  "qa:supply-chain": "tsx scripts/quality/supply-chain-gate.mts",
  "qa:recovery": "tsx scripts/quality/recovery-gate.mts",
  "qa:reliability": "tsx scripts/quality/reliability-gate.mts",
  "qa:staging-access": "tsx scripts/quality/staging-access-gate.mts",
  "e2e:mobile:d0:ios": "tsx scripts/quality/mobile-d0-evidence.mts --platform ios",
  "e2e:mobile:d0:android": "tsx scripts/quality/mobile-d0-evidence.mts --platform android",
  "e2e:mobile:m1:ios": "tsx scripts/quality/mobile-m1-evidence.mts --platform ios",
  "e2e:mobile:m1:android": "tsx scripts/quality/mobile-m1-evidence.mts --platform android",
  "release:mobile:artifacts": "tsx scripts/release/build-mobile-artifacts.mts",
  "gate:d0": "tsx scripts/quality/run-gate.mts --milestone d0",
  "gate:m1": "tsx scripts/quality/run-gate.mts --milestone m1"
}
```

不得依赖 pnpm 对不存在脚本的隐式行为；后续计划创建对应 `.mts` 文件时必须保留这里的名称和参数契约。

- [ ] **Step 7: 验证与提交**

```bash
pnpm exec vitest run scripts/quality/test/run-gate.spec.ts
git add quality scripts/quality package.json pnpm-lock.yaml artifacts/evidence/.gitkeep
git commit -m "feat(quality): add capability and milestone gates"
```

## Task 8: 建立基础 CI 与仓库自检

**Files:**

- Create: `.github/workflows/ci.yml`
- Create: `scripts/quality/check-boundaries.mts`
- Create: `scripts/quality/check-forbidden-surfaces.mts`
- Create: `security/artifact-inventory.yml`
- Modify: `package.json`

- [ ] **Step 1: 写禁止 surface 的失败 Fixture**

测试扫描一个包含 `/trade`、`private_fund`、`public_portfolio`、`apns`、`personalized_target_price` 的临时 registry，并断言退出码非零。

- [ ] **Step 2: 实现边界扫描**

扫描 route、Deep Link、OpenAPI、导航 registry 与 Fixture；文档目录排除，运行代码中任何禁用 surface 命中即失败。

- [ ] **Step 3: 创建 CI jobs**

`install` 使用 `pnpm install --frozen-lockfile`；随后并行运行 format check、lint、typecheck、unit tests、build、boundary scan。CI 上传测试报告，但不上传 `.env` 或数据库 dump。

- [ ] **Step 4: 运行本地基线**

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm qa:boundaries
```

- [ ] **Step 5: 提交 Bootstrap Gate**

```bash
git add .github scripts/quality security package.json pnpm-lock.yaml
git commit -m "ci: enforce bootstrap quality boundaries"
```

## Wave 0 退出清单

- [ ] 四个应用壳和所有共享包均可从干净检出安装、测试和构建。
- [ ] 火球 token 已集中定义，应用不复制品牌色常量。
- [ ] 契约包可以承载 D0 Fixture 与 M1 API，但尚未声称 M1 contract 冻结。
- [ ] Quality runner 能拒绝缺失、跳过和空测试。
- [ ] Forbidden/LicensedOnly/FeatureFlagOff surface 在运行构建中为零。
- [ ] 根基线 commit SHA 已记录，可创建 D0 Web、Mobile 独立 worktree。
