# 火球 Web 与 App 高完整度交付计划套件

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不触碰未授权数据、持牌交易与雪球专有资产的前提下，先交付 48 小时 Fixture Demo，再交付 7 天员工封闭 Vertical Alpha，并用可追踪证据推进长期高完整度。

**Architecture:** 使用 pnpm + Turborepo 管理 Next.js Web、Expo App、NestJS/Fastify API 与 React 管理端；共享 Zod/ts-rest 契约、生成 SDK、设计 token 和测试 Fixture。M1 使用 PostgreSQL、Drizzle、Valkey/BullMQ、Outbox/Inbox 与 SSE；D0 只消费版本化本地 Fixture。

**Tech Stack:** Node 24.15、pnpm 11.4、TypeScript 6.0、Next.js 16.3、React 19.2、Expo 57、React Native 0.86、NestJS 11、Fastify 5、Drizzle 0.45、Zod 4、ts-rest 3.52、Vitest 4、Playwright 1.62、Maestro、ECharts 6。

## Global Constraints

- 品牌固定使用“火球”；不得复制雪球商标、Logo、私有代码、私有接口、真实用户数据和受版权保护素材。
- D0 所有业务数据必须来自 `packages/contracts/fixtures/d0.v1.json`，界面必须展示“演示数据”、`source` 与 `as_of`。
- M1 只在双层员工准入环境运行；边缘 Zero Trust/VPN 与 API `alpha_access` 必须同时通过。
- M1 行情只允许确定性 Synthetic Provider；没有书面展示权时，不接入外部行情。
- D0 Required 只包含 `CAP-ID-001`、`CAP-INST-001`、`CAP-MD-001`、`CAP-FEED-001`、`CAP-WATCH-001`。
- M1 Required 只包含上述 5 项加 `CAP-CONTENT-001`、`CAP-SOCIAL-001`、`CAP-NOTIF-001`、`CAP-MOD-001`、`CAP-PORT-001`。
- `CAP-ALERT-001`、`CAP-FOLLOW-001`、`CAP-AI-001` 是 Stretch；`CAP-PUSH-001`、`CAP-PUBLIC-PORT-001`、`CAP-PRIVATE-FUND-001` 与真实交易不进入 D0/M1 运行构建。
- 所有 Required 测试禁止 `skip`、`fixme`、`todo` 与 `--passWithNoTests`。
- 任何能力只有在 CAP → PAGE → STATE → TOUCH → API/EVENT → DATA → TEST → EVIDENCE 全链闭合后才可标记“已验证”。
- 每个实现任务先提交失败测试，再实现，再运行目标测试、包级 lint/typecheck/build，最后提交单一目的 commit。
- 根配置、lockfile、共享契约、生成 SDK、设计 token 和跨端 E2E 只由主代理修改。

---

## 1. 计划文件与执行顺序

| 顺序 | 计划文件                                                 | 交付物                                         | 开始条件                         |
| ---: | -------------------------------------------------------- | ---------------------------------------------- | -------------------------------- |
|    1 | `2026-08-08-huoqiu-wave0-bootstrap.md`                   | Monorepo、共享原语、应用壳、质量 runner        | 批准规格与本地工具链             |
|    2 | `2026-08-08-huoqiu-d0-demo.md`                           | D0 契约、Web 黄金路径、App 四页导航壳          | Wave 0 bootstrap SHA             |
|    3 | `2026-08-08-huoqiu-m1-foundation.md`                     | 31 个 API、18 个事件、SDK、数据库、认证与 Seed | D0 可并行，不要求 D0 Gate 先通过 |
|    4 | `2026-08-08-huoqiu-m1-market-watchlist.md`               | Identity、标的、行情、Feed、自选纵向链         | M1 contract SHA 与空库迁移通过   |
|    5 | `2026-08-08-huoqiu-m1-community-moderation.md`           | 短帖、评论、点赞、举报、审核后台               | Content/Moderation 状态机冻结    |
|    6 | `2026-08-08-huoqiu-m1-portfolio-notifications.md`        | canonical Inbox/SSE、私有组合账本              | Identity、Synthetic Market 可用  |
|    7 | `2026-08-08-huoqiu-m1-mobile-integration-release.md`     | 三端集成、安全、恢复、发布证据                 | 10 个 Required CAP 代码冻结      |
|    8 | `2026-08-08-huoqiu-post-m1-high-completeness-roadmap.md` | M2、公开 V1 与高完整度路线                     | M1 通过；每波外部依赖单独过 Gate |

Wave 0 与 D0 的 UI 实现可以在 D0 contract SHA 发布后并行；M1 API 的数据库与 Seed 不以 D0 Gate 为硬前置。任何客户端不得在 contract SHA 发布前复制 DTO 或猜测字段。

## 2. Monorepo 目标文件树

```text
apps/
  admin/                  # M1 审核管理端
  api/                    # NestJS/Fastify 模块化单体
  mobile/                 # Expo Router iOS/Android
  web/                    # Next.js App Router
packages/
  config/                 # ESLint、TypeScript、环境校验
  contracts/              # Zod/ts-rest、OpenAPI、事件 Schema、Fixture
  db/                     # Drizzle schema、migration helper、test DB
  design-tokens/          # 品牌 token 与跨端语义色
  domain/                 # 金额、ID、权限和领域纯函数
  market-adapters/        # Synthetic Provider 与适配器契约
  native-ui/              # Expo 共享组件
  sdk/                    # 由契约生成，不手改
  testkit/                # Fixture loader、factory、assertion
  web-ui/                 # Web 共享组件
infra/
  compose.yaml
  postgres/
quality/
  manifests/
  evidence/
  fixtures/
scripts/
  quality/
  recovery/
security/
tests/
  e2e/
    playwright/
    maestro/
artifacts/evidence/.gitkeep
```

## 3. 并行泳道与文件所有权

### 3.1 直接依赖版本基线

以下版本在 2026-08-08 从 npm registry 核对；实现任务不得自动升级，变更必须经主代理更新许可证/SCA 证据和 lockfile：

| 类别             | 精确版本                                                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime/Monorepo | `pnpm@11.4.0`、`turbo@2.10.8`、`typescript@6.0.3`、`tsx@4.23.9`                                                                                                                                         |
| Root tooling     | `@types/node@24.13.3`、`eslint@10.8.0`、`prettier@3.9.6`                                                                                                                                                |
| Web              | `next@16.3.0`、`react@19.2.8`、`react-dom@19.2.8`、`@types/react@19.2.18`、`@types/react-dom@19.2.4`                                                                                                    |
| Mobile           | `expo@57.0.11`、`expo-router@57.0.11`、`expo-secure-store@57.0.1`、`react-native@0.86.2`、`react-native-web@0.21.2`、`react-native-svg@15.15.5`、`react-native-webview@14.0.1`（仅图表 Spike 失败回退） |
| Mobile UI        | `@shopify/flash-list@2.3.2`、`react-native-reanimated@4.5.3`、`@wuba/react-native-echarts@3.1.1`                                                                                                        |
| API/Auth         | `@nestjs/core@11.1.28`、`@nestjs/platform-fastify@11.1.28`、`fastify@5.11.2`；`better-auth@1.6.26` 与 `@thallesp/nestjs-better-auth@2.7.0` 仅在认证 Spike 通过后安装到运行应用                          |
| API safety       | `@fastify/helmet@13.1.0`、`@fastify/rate-limit@11.2.0`                                                                                                                                                  |
| Contract/Data    | `zod@4.4.3`、`@ts-rest/core@3.52.1`、`@ts-rest/nest@3.52.1`、`@ts-rest/open-api@3.52.1`、`drizzle-orm@0.45.2`、`drizzle-kit@0.31.10`、`postgres@3.4.9`                                                  |
| State/Queue      | `@tanstack/react-query@5.101.4`、`zustand@5.0.14`、`bullmq@6.0.9`                                                                                                                                       |
| Charts/Web UI    | `echarts@6.1.0`、`@radix-ui/react-dialog@1.1.23`、`@radix-ui/react-tabs@1.1.21`、`lucide-react@1.30.0`、`clsx@2.1.1`、`tailwind-merge@3.6.0`                                                            |
| Tests            | `vitest@4.1.10`、`@playwright/test@1.62.1`、`testcontainers@12.1.0`、`@axe-core/playwright@4.12.1`、`@testing-library/react@16.3.2`、`@testing-library/react-native@14.0.1`                             |

Keycloak、PostgreSQL、Valkey、Jaeger、Gitleaks、Semgrep、Syft、Trivy、Grype、Maestro 与 k6 使用锁定容器 digest 或工具版本；对应 digest 在首次引入时写入 `security/artifact-inventory.yml`，未登记不得进入 Gate。

根 `pnpm-workspace.yaml` 的 `onlyBuiltDependencies` 只允许 `esbuild` 执行安装脚本；pnpm 11 的 `pnpm approve-builds esbuild` 同时生成的 `allowBuilds.esbuild: true` 是该单包批准的项目内记录。不得以全局配置或临时 minimum-release-age 豁免绕过供应链策略，也不得批准其他构建脚本。

### 3.2 泳道所有权

| 泳道   | 分支格式                | 唯一写入范围                                                                                                                                                                                                                                                         | 必须返回的证据                                   |
| ------ | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 主代理 | `agent/root/<cap-id>`   | 根文件与 lockfile、`.github`、`docs/adr`、`infra`、`security`、`packages/config`、`packages/contracts`、`packages/sdk`、`packages/design-tokens`、`packages/testkit`、`quality`、`scripts`、`tests/e2e`、`tests/recovery`、`tests/performance`、`artifacts/evidence` | base SHA、contract SHA、Gate 原始日志            |
| API    | `agent/api/<cap-id>`    | `apps/api`（含独立 worker entrypoints）、`packages/db`、`packages/domain`、`packages/market-adapters`                                                                                                                                                                | migration replay、API integration/security tests |
| Web    | `agent/web/<cap-id>`    | `apps/web`、`apps/admin`、`packages/web-ui`                                                                                                                                                                                                                          | component、Playwright、视觉证据                  |
| Mobile | `agent/mobile/<cap-id>` | `apps/mobile`、`packages/native-ui`                                                                                                                                                                                                                                  | iOS/Android build、component 与 Maestro 原始日志 |

集成只允许主代理在干净 worktree 中按依赖顺序 cherry-pick。子代理可以在自己唯一写入范围内修改 `package.json`，但必须先在任务交接中列出精确版本、许可证、用途和所需 workspace edge；不得运行会修改 lockfile 的安装命令，也不得提交 lockfile。主代理审查依赖申请后集中执行一次 `pnpm install --frozen-lockfile=false`、运行许可证/SCA 与受影响构建，再把唯一 lockfile commit 合入集成分支。

一个计划 Task 若列出多个泳道的文件，表示一个编排任务而不是授权单个代理跨界写入。主代理必须先拆成 `root/api/web/mobile` 子任务，每个子任务固定同一 base/contract SHA、只产生本泳道 commit；全部独立审查通过后才按 Root → API → Web → Mobile 顺序集成。任何评审修复也返回原所有者 worktree，主代理不得在集成分支直接改写其他泳道文件。

固定 worktree 为 `.worktrees/api`、`.worktrees/web`、`.worktrees/mobile`，分别只检出 `agent/api/*`、`agent/web/*`、`agent/mobile/*`；主代理留在干净根 worktree。创建前必须确认 `.worktrees/` 已被忽略。每个新任务从主代理发布的 base SHA 新建分支，上一任务未集成时不得在同一 worktree 叠加下一项写任务。

## 4. 任务依赖 DAG

```text
G0/G1 + tools
  -> W0-01 root workspace
  -> W0-02 shared primitives and design tokens
  -> W0-03 app shells
  -> W0-04 quality runner
      -> D0 contract + fixture + routes
      -> D0 Web lane
      -> D0 Mobile lane
      -> D0 independent gate

W0-04
  -> W0-05a Better Auth/Fastify/Expo spike + Accepted ADR
  -> W0-05b App chart/Expo spike + Accepted ADR
      -> W0-06 provider-neutral 31-operation contract + 18 event schemas
      -> W0-07 selected-provider private schema + generated SDK
      -> W0-08 Drizzle schema + empty replay
      -> Identity + Instrument
          -> Market + Watchlist + Feed
          -> Content + Moderation state machine
              -> Social + public Feed projection
          -> Canonical Inbox + SSE
          -> Private Portfolio Ledger + valuation
              -> Web/iOS/Android shared golden paths
                  -> security + recovery + evidence gate
```

## 5. 里程碑 Gate

### D0 Gate

```bash
pnpm gate:d0
```

成功输出必须逐字包含：

```text
D0_GATE PASS required_caps=5 failed=0 skipped=0 p0=0 p1=0
```

### M1 Gate

```bash
pnpm gate:m1
```

成功输出必须逐字包含：

```text
M1_GATE PASS required_caps=10 api_operations=31 event_types=18 failed=0 skipped=0 p0=0 p1=0
```

### 单能力 Gate

```bash
pnpm qa:cap -- --milestone m1 --cap CAP-WATCH-001
```

成功输出：

```text
CAPABILITY_GATE PASS milestone=M1 cap=CAP-WATCH-001 failed=0 skipped=0
```

## 6. 每次任务的完成模板

- [ ] 在任务记录中固定 `base_sha`、`contract_sha`、CAP ID、Fixture 版本和允许路径。
- [ ] 运行任务指定的失败测试并保存退出码非零的日志。
- [ ] 只修改任务允许路径，实现最小通过行为。
- [ ] 运行目标测试并确认 `failed=0`、`skipped=0`。
- [ ] 运行受影响包的 lint、typecheck、build。
- [ ] 对新增依赖记录包名、精确版本、许可证与采用理由。
- [ ] 生成 `artifacts/evidence/$BUILD_SHA/...` 的原始报告。
- [ ] 提交单一目的 commit，并在交接中列出 commit SHA、文件、命令、风险。
- [ ] 由非实现者复核；主代理在干净检出重跑对应 Gate。

## 7. 首夜自动执行顺序

- [ ] 提交本计划套件，确保规格和计划基线可恢复。
- [ ] 使用 `superpowers:using-git-worktrees` 创建 API、Web、Mobile 三个独立 worktree；主代理保留根集成 worktree，不另建 Wave 0 写 worktree。
- [ ] 主代理实现 Wave 0 根工作区与 D0 contract/fixture。
- [ ] contract SHA 通过后，把 D0 Web 和 D0 Mobile 任务分别交给独立子代理。
- [ ] 主代理实现质量 runner，并在子代理开发期间准备 Playwright 黄金路径。
- [ ] 逐个审查、集成、重跑 `pnpm gate:d0`；不通过时只修 D0 Required。
- [ ] D0 Gate 通过后继续 M1 foundation，不等待产品负责人再次确认。

## 8. 每日集成点与停止条件

- 每日 09:00（Asia/Shanghai）主代理发布当日 `base_sha`、`contract_sha`、允许/禁止路径、Fixture 版本、验收命令和依赖申请状态。没有任务包的代理只读，不猜字段。
- 每日 12:00 为第一次集成窗口：先 Root contract/generated/lockfile，再 API migration/服务端，再 Web、Mobile；每次 cherry-pick 后立即运行受影响的 contract、migration、package tests。破坏性契约变更只能在该窗口或 18:00 窗口处理。
- 每日 18:00 为第二次集成窗口：清空至多两个待集成 commit，运行全量 lint/typecheck/test/build 与当日纵向冒烟，记录新的 base SHA。窗口结束后主干不绿则次日停止新增功能。
- H4 必须发布可生成 SDK 的 contract candidate；H32 至少释放一个实现代理，对非本人泳道做只读独立验证；Day 6 三个实现代理全部转为交叉验证：API 验 Web/Admin，Web 验 Mobile，Mobile 验 API/DB。
- 待集成超过 2 项、最老等待超过半个工作日、同日第二次破坏性 contract 修改、生成 DTO 被复制、迁移空库回放失败或测试只能靠扩大 timeout 通过时，立即停止扩功能并先恢复绿主干。
