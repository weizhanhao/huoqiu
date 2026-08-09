# 火球 M1 契约与数据基础 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 发布可生成 SDK 的 M1 contract SHA，建立 31 个 REST operation、18 个领域事件、PostgreSQL 空库迁移、双层员工准入、确定性 Synthetic Provider 和版本化 Seed。

**Architecture:** Zod/ts-rest 是请求响应契约的唯一代码源，由脚本生成 OpenAPI 与 SDK；Drizzle schema 是数据库结构的唯一代码源。API 使用 NestJS/Fastify 模块化单体，业务表与 Outbox 同事务，消费者以 Inbox 去重。身份层先验证 Better Auth，若硬性 Spike 条件失败则采用独立 Keycloak OIDC，不同时维护两套认证。

**Tech Stack:** ts-rest 3.52、Zod 4.4、NestJS 11.1、Fastify 5.11、Drizzle 0.45、PostgreSQL 17、Better Auth 1.6、Keycloak OIDC fallback、Valkey、BullMQ 6、Vitest 4、Testcontainers。

## Global Constraints

- M1 仍是员工封闭 Alpha；Guest/Public 只是通过边缘准入后的业务身份，不代表公网。
- OpenAPI 只能包含批准规格的 31 个 operation；事件目录只能包含 18 个 v1 event。
- API/事件 payload 在本计划实现并经契约测试通过之前均不得声称冻结。
- `private_fund`、`trade`、`public_portfolio`、`push`、`ai_advice` 不得出现在 OpenAPI、事件、表、Seed 和 route registry。
- 所有金额、价格、数量使用 decimal string；version 与 sequence 使用 int64 string。
- 所有 POST 要求 `Idempotency-Key`；PUT/DELETE 使用确定资源键或 `If-Match`。
- 本文任务的强制执行 DAG 为：Task 0A（认证 Spike/ADR）→ Task 0B（独立批准 oracle）→ Task 1–4（provider-neutral contract/event/SDK）→ Task 5（仅为 ADR 选中 provider 建私有 Schema）→ Task 6A → Task 6B → Task 8–12。不得按旧编号跳过先决项。
- `packages/contracts`、OpenAPI、SDK 和公共身份 port 只能表达 provider-neutral 语义；Cookie/token/session 私有字段、provider 表和适配器配置只能留在 `auth-provider.adapter.ts` 与 `auth-provider-private.ts`，不得泄漏到公共 contract 或 SDK。
- `quality/oracles/m1/*.json` 与其批准哈希是由独立复核人按批准规格人工录入并签核的只读输入。任何 generator、gate 或待测实现均不得创建、改写或从自己的输出反推这些文件。

---

## Task 0A: 先执行 Better Auth / Fastify / Expo 安全 Spike 并接受 ADR

**Files:**

- Create: `docs/adr/0001-auth-provider.md`
- Create: `spikes/auth/package.json`
- Create: `spikes/auth/better-auth/probe.ts`
- Create: `spikes/auth/keycloak/probe.ts`
- Create: `spikes/auth/test/auth-provider.conformance.spec.ts`
- Create: `apps/mobile/src/auth/secure-session-spike.ts`
- Create: `apps/mobile/tests/auth/secure-session-spike.spec.ts`
- Create: `scripts/quality/auth-spike-gate.mts`
- Modify: `apps/mobile/package.json`
- Modify: `package.json`

该任务是 Root + Mobile 两个单写者子任务：Mobile 只提交 `apps/mobile/**`；Root 只提交 ADR、`spikes/**`、`scripts/**`、根 `package.json` 与 `pnpm-lock.yaml`。Root 在合并 Mobile 的依赖声明后统一更新 lockfile。

- [ ] **Step 1: 写六项硬性 Spike 测试**

测试注册/登录/session/logout、HttpOnly+Secure+SameSite Cookie、Bearer token、撤销、Nest Fastify request lifecycle、Expo SecureStore 持久化与退出清理。

- [ ] **Step 2: 运行 Better Auth 候选实现**

```bash
pnpm qa:auth-spike -- --provider better-auth
```

只有六项全过、Better Auth 与 Nest adapter 均为可接受许可证、无 High/Critical 漏洞时才选 Better Auth。

- [ ] **Step 3: 失败时运行唯一 Keycloak fallback**

```bash
pnpm qa:auth-spike -- --provider keycloak
```

Keycloak 必须通过 OIDC Authorization Code + PKCE、token refresh、logout/revocation 和 Expo secure token 测试。不得同时保留两套运行 route。

- [ ] **Step 4: 写 Accepted ADR 并锁定边界**

ADR 记录候选版本、测试命令、原始结果、被选方案和被拒方案；状态必须是 `Accepted`，结论必须与 Gate 结果一致。ADR 还必须列出选中 provider 的私有表/配置清单，以及公共 contract/SDK 禁止出现的 provider 字段。

- [ ] **Step 5: 按单写者分别提交并由 Root 更新 lockfile**

```bash
# Mobile lane
git add apps/mobile/src/auth apps/mobile/tests/auth apps/mobile/package.json
git commit -m "spike(mobile): prove secure auth session storage"

# Root lane, after merging Mobile
git add docs/adr spikes/auth scripts/quality package.json pnpm-lock.yaml
git commit -m "spike(auth): select M1 identity provider"
```

## Task 0B: 建立独立、只读的批准 Oracle

**Files:**

- Create: `quality/oracles/m1/api-operations.v1.json`
- Create: `quality/oracles/m1/event-types.v1.json`
- Create: `quality/oracles/m1/fixture-policy.v1.json`
- Create: `quality/oracles/m1/approved.sha256`
- Create: `scripts/quality/test/oracle-readonly.spec.ts`

- [ ] **Step 1: 由非实现者从批准规格人工录入失败基线**

Oracle 必须逐条保存 31 个 API 的 `api_id/operation_id/method/path/cap_id/action`、18 个事件的 `event_type/producer/version`，以及 Fixture 的允许来源、禁止 PII 键和允许 surface。录入者不得运行 contract/event generator 产生该内容。

- [ ] **Step 2: 双人复核并写批准哈希**

```bash
shasum -a 256 quality/oracles/m1/api-operations.v1.json quality/oracles/m1/event-types.v1.json quality/oracles/m1/fixture-policy.v1.json > quality/oracles/m1/approved.sha256
```

实现者和独立复核人分别核对规格；复核人在任务记录中批准 exact SHA。后续脚本只能读取这些文件；`oracle-readonly.spec.ts` 使用固定批准 SHA 发现任何改写并退出非零。

- [ ] **Step 3: 在生成器出现前提交批准输入**

```bash
git add quality/oracles/m1 scripts/quality/test/oracle-readonly.spec.ts
git commit -m "test(quality): approve independent M1 contract oracles"
```

此提交必须早于 Tasks 1–4，且批准 oracle 的变更需要新的独立复核记录，不能与实现变更在同一审查中自批。

## Task 1: 建立 31-operation ts-rest Contract Registry

**Files:**

- Create: `packages/contracts/src/m1/common.ts`
- Create: `packages/contracts/src/m1/auth.contract.ts`
- Create: `packages/contracts/src/m1/instrument.contract.ts`
- Create: `packages/contracts/src/m1/feed-watchlist.contract.ts`
- Create: `packages/contracts/src/m1/content-social.contract.ts`
- Create: `packages/contracts/src/m1/notification-moderation.contract.ts`
- Create: `packages/contracts/src/m1/portfolio.contract.ts`
- Create: `packages/contracts/src/m1/router.ts`
- Create: `packages/contracts/src/m1/operation-registry.ts`
- Create: `packages/contracts/test/m1-operation-registry.spec.ts`
- Create: `packages/contracts/test/m1-approved-oracle.spec.ts`
- Create: `packages/contracts/test/m1-forbidden-operations.spec.ts`

- [ ] **Step 1: 写数量、ID、权限和禁用 surface 的失败测试**

```ts
import { m1OperationRegistry } from '../src/m1/operation-registry';

it('contains exactly the approved M1 surface', () => {
  expect(m1OperationRegistry).toHaveLength(31);
  expect(new Set(m1OperationRegistry.map((item) => item.apiId)).size).toBe(31);
  expect(m1OperationRegistry.every((item) => item.capId && item.action)).toBe(true);
  expect(JSON.stringify(m1OperationRegistry)).not.toMatch(/trade|private_fund|public_portfolio|push|target_price/i);
});
```

`m1-approved-oracle.spec.ts` 必须把 registry 的规范化记录逐字段与只读 `quality/oracles/m1/api-operations.v1.json` 比较，并先验证 `approved.sha256`。不能用 registry 自己导出的快照作为期望值。

- [ ] **Step 2: 运行并确认 registry 不存在**

```bash
pnpm --filter @huoqiu/contracts exec vitest run test/m1-operation-registry.spec.ts test/m1-forbidden-operations.spec.ts
```

- [ ] **Step 3: 定义公共响应与 header Schema**

```ts
export const requestMetaSchema = z.object({
  request_id: z.string().min(1),
  trace_id: z.string().min(1),
});

export const idempotencyHeaderSchema = z.object({
  'idempotency-key': z.string().min(8).max(128),
});

export const versionStringSchema = z.string().regex(/^\d+$/);
export const decimalStringSchema = z.string().regex(/^-?\d+(\.\d+)?$/);

export const errorCodes = [
  'AUTH_REQUIRED', 'SESSION_EXPIRED', 'FORBIDDEN', 'NOT_FOUND', 'VALIDATION_FAILED',
  'CONFLICT', 'RATE_LIMITED', 'DATA_STALE', 'DATA_UNAVAILABLE', 'ENTITLEMENT_DENIED',
  'CONTENT_UNAVAILABLE', 'LEDGER_INVARIANT_FAILED', 'STREAM_CURSOR_EXPIRED',
] as const;
```

- [ ] **Step 4: 按批准目录注册 31 个 operation**

Registry 必须包含下列精确记录，并补充对应 CAP ID、Action、权限角色、mutation 语义和所属 contract：

```ts
export const approvedOperations = [
  ['API-AUTH-001', 'authRegister', 'POST', '/v1/auth/register'],
  ['API-AUTH-002', 'authLogin', 'POST', '/v1/auth/login'],
  ['API-AUTH-003', 'authGetSession', 'GET', '/v1/auth/session'],
  ['API-AUTH-004', 'authLogout', 'POST', '/v1/auth/logout'],
  ['API-INST-001', 'instrumentSearch', 'GET', '/v1/instruments/search'],
  ['API-INST-002', 'listingGet', 'GET', '/v1/listings/:id'],
  ['API-MD-001', 'listingGetQuote', 'GET', '/v1/listings/:id/quote'],
  ['API-MD-002', 'listingGetBars', 'GET', '/v1/listings/:id/bars'],
  ['API-FEED-001', 'feedGet', 'GET', '/v1/feed'],
  ['API-WATCH-001', 'watchlistGetDefault', 'GET', '/v1/me/watchlist'],
  ['API-WATCH-002', 'watchlistPutItem', 'PUT', '/v1/me/watchlist/items/:listingId'],
  ['API-WATCH-003', 'watchlistDeleteItem', 'DELETE', '/v1/me/watchlist/items/:listingId'],
  ['API-POST-001', 'postCreate', 'POST', '/v1/posts'],
  ['API-POST-002', 'postGet', 'GET', '/v1/posts/:id'],
  ['API-COMMENT-000', 'commentList', 'GET', '/v1/posts/:id/comments'],
  ['API-COMMENT-001', 'commentCreate', 'POST', '/v1/posts/:id/comments'],
  ['API-REACTION-001', 'postPutLike', 'PUT', '/v1/posts/:id/reactions/like'],
  ['API-REACTION-002', 'postDeleteLike', 'DELETE', '/v1/posts/:id/reactions/like'],
  ['API-NOTIF-001', 'notificationList', 'GET', '/v1/me/notifications'],
  ['API-NOTIF-002', 'notificationAdvanceReadWatermark', 'POST', '/v1/me/notifications/read-watermark'],
  ['API-NOTIF-003', 'notificationStream', 'GET', '/v1/me/events'],
  ['API-REPORT-001', 'reportCreate', 'POST', '/v1/reports'],
  ['API-MOD-001', 'moderationCaseList', 'GET', '/v1/admin/moderation/cases'],
  ['API-MOD-002', 'moderationDecisionCreate', 'POST', '/v1/admin/moderation/cases/:id/decisions'],
  ['API-PORT-000', 'portfolioListMine', 'GET', '/v1/me/portfolios'],
  ['API-PORT-001', 'portfolioCreate', 'POST', '/v1/portfolios'],
  ['API-PORT-002', 'portfolioGet', 'GET', '/v1/portfolios/:id'],
  ['API-PORT-003', 'portfolioCreateLedgerEntry', 'POST', '/v1/portfolios/:id/ledger-entries'],
  ['API-PORT-004', 'portfolioCreateReversal', 'POST', '/v1/portfolios/:id/reversals'],
  ['API-PORT-005', 'portfolioListPositions', 'GET', '/v1/portfolios/:id/positions'],
  ['API-PORT-006', 'portfolioListLedgerEntries', 'GET', '/v1/portfolios/:id/ledger-entries'],
] as const;
```

排序必须保持不变；测试同时断言 method/path/operationId/API ID 的组合唯一。

- [ ] **Step 5: 为每个 contract 写成功和统一错误响应**

列表使用 `{ items, next_cursor, ...requestMeta }`；单资源包含 `...requestMeta`。错误响应只引用共享 `apiErrorSchema`，不得把异常对象直接序列化。

Auth contract 只描述 register/login/session/logout 的业务语义、通用 cookie/bearer 传输和统一错误；不得暴露 Better Auth 表名、Keycloak realm/client 字段或任一 provider 的 token payload。

- [ ] **Step 6: 验证数量与 mutation headers**

```bash
pnpm --filter @huoqiu/contracts exec vitest run test/m1-operation-registry.spec.ts test/m1-approved-oracle.spec.ts test/m1-forbidden-operations.spec.ts
```

预期：31 个唯一 API ID、31 个 operationId、禁止 surface 零命中。

- [ ] **Step 7: 提交**

```bash
git add packages/contracts/src/m1 packages/contracts/test
git commit -m "feat(contracts): define M1 REST surface"
```

## Task 2: 生成并锁定 OpenAPI

**Files:**

- Create: `packages/contracts/scripts/generate-openapi.mts`
- Create: `packages/contracts/openapi/huoqiu.v1.yaml`
- Create: `packages/contracts/test/openapi.spec.ts`
- Modify: `packages/contracts/package.json`

- [ ] **Step 1: 写 OpenAPI 再生成无差异测试**

测试解析 YAML，断言 `paths` 中有 31 个 operation、所有 operation 有 `x-cap-id`、`x-action`、稳定 `operationId`，并且 security/错误响应符合 registry；随后逐字段比较独立 `api-operations.v1.json`。Oracle 的哈希不匹配时测试必须先失败。

- [ ] **Step 2: 实现确定性生成器**

生成器从 `m1Router` 和 registry 生成 OpenAPI 3.1；键按字典序稳定排序；顶部写 `x-contract-version: m1.v1`，不得写生成时间。

- [ ] **Step 3: 在临时目录首次生成、用 Oracle 批准，再安装目标文件**

```bash
contract_tmp_dir="$(mktemp -d)"
trap 'rm -rf "$contract_tmp_dir"' EXIT
pnpm --filter @huoqiu/contracts generate:openapi -- --output "$contract_tmp_dir/huoqiu.v1.yaml"
OPENAPI_CANDIDATE="$contract_tmp_dir/huoqiu.v1.yaml" pnpm --filter @huoqiu/contracts exec vitest run test/openapi.spec.ts
install -m 0644 "$contract_tmp_dir/huoqiu.v1.yaml" packages/contracts/openapi/huoqiu.v1.yaml
pnpm --filter @huoqiu/contracts generate:openapi -- --check
```

`--check` 必须重新生成到脚本自己的临时目录后做 byte-for-byte 比较；首次生成不得依赖看不到 untracked 文件的 `git diff`。

- [ ] **Step 4: 提交**

```bash
git add packages/contracts
git commit -m "feat(contracts): generate M1 OpenAPI"
```

## Task 3: 定义 18 个事件 Schema

**Files:**

- Create: `packages/contracts/src/events/envelope.ts`
- Create: `packages/contracts/src/events/registry.ts`
- Create: `packages/contracts/src/events/payloads.ts`
- Create: `packages/contracts/events/identity.user_registered.v1.schema.json`
- Create: `packages/contracts/events/content.post_submitted.v1.schema.json`
- Create: `packages/contracts/events/moderation.decision_recorded.v1.schema.json`
- Create: `packages/contracts/events/content.post_published.v1.schema.json`
- Create: `packages/contracts/events/content.post_hidden.v1.schema.json`
- Create: `packages/contracts/events/content.post_restored.v1.schema.json`
- Create: `packages/contracts/events/identity.user_suspended.v1.schema.json`
- Create: `packages/contracts/events/social.comment_submitted.v1.schema.json`
- Create: `packages/contracts/events/social.comment_published.v1.schema.json`
- Create: `packages/contracts/events/social.comment_hidden.v1.schema.json`
- Create: `packages/contracts/events/social.comment_restored.v1.schema.json`
- Create: `packages/contracts/events/social.reaction_changed.v1.schema.json`
- Create: `packages/contracts/events/watchlist.item_changed.v1.schema.json`
- Create: `packages/contracts/events/notification.created.v1.schema.json`
- Create: `packages/contracts/events/notification.read_watermark_advanced.v1.schema.json`
- Create: `packages/contracts/events/moderation.report_submitted.v1.schema.json`
- Create: `packages/contracts/events/portfolio.ledger_entry_posted.v1.schema.json`
- Create: `packages/contracts/events/market.quote_revised.v1.schema.json`
- Create: `packages/contracts/scripts/generate-events.mts`
- Create: `packages/contracts/test/events/registry.spec.ts`
- Create: `packages/contracts/test/events/approved-oracle.spec.ts`
- Create: `packages/contracts/test/events/replay.spec.ts`

- [ ] **Step 1: 写事件数量、信封和唯一生产者失败测试**

```ts
expect(eventRegistry).toHaveLength(18);
expect(new Set(eventRegistry.map((event) => event.type)).size).toBe(18);
expect(eventEnvelopeSchema.parse(sample).version).toBe(1);
```

`approved-oracle.spec.ts` 对每个 `event_type/producer/version` 与 `quality/oracles/m1/event-types.v1.json` 做完整等值比较，并先校验批准 SHA；不接受由 registry 生成的快照。

- [ ] **Step 2: 实现统一信封**

```ts
export const eventEnvelopeSchema = z.object({
  event_id: z.string().uuid(),
  event_type: z.string().min(1),
  version: z.literal(1),
  occurred_at: z.string().datetime({ offset: true }),
  producer: z.enum(['identity', 'content', 'social', 'moderation', 'watchlist', 'notification', 'portfolio', 'market']),
  aggregate_id: z.string().min(1),
  sequence: versionStringSchema,
  trace_id: z.string().min(1),
  payload: z.unknown(),
});
```

- [ ] **Step 3: 定义最小 payload**

身份事件包含 `user_id/reason/effective_at`；内容与评论事件包含目标 ID、作者 ID、status/version；reaction 包含 actor/target/active；watchlist 包含 user/listing/present；notification 包含 notification/recipient/canonical_key/deep_link；moderation 包含 case/target/action/decision_version；portfolio 包含 portfolio/ledger_entry/committed_version；market revision 包含 listing/sequence/revision/as_of。每个 payload 禁止 email、token、正文全文与审核证据。

Registry 必须逐字包含：

```ts
export const approvedEventTypes = [
  'identity.user_registered',
  'content.post_submitted',
  'moderation.decision_recorded',
  'content.post_published',
  'content.post_hidden',
  'content.post_restored',
  'identity.user_suspended',
  'social.comment_submitted',
  'social.comment_published',
  'social.comment_hidden',
  'social.comment_restored',
  'social.reaction_changed',
  'watchlist.item_changed',
  'notification.created',
  'notification.read_watermark_advanced',
  'moderation.report_submitted',
  'portfolio.ledger_entry_posted',
  'market.quote_revised',
] as const;
```

- [ ] **Step 4: 在临时目录生成 18 个 JSON Schema，经 Oracle 验证后安装**

```bash
event_tmp_dir="$(mktemp -d)"
trap 'rm -rf "$event_tmp_dir"' EXIT
pnpm --filter @huoqiu/contracts generate:events -- --output "$event_tmp_dir"
EVENT_SCHEMA_CANDIDATE_DIR="$event_tmp_dir" pnpm --filter @huoqiu/contracts exec vitest run test/events
pnpm --filter @huoqiu/contracts generate:events -- --install-from "$event_tmp_dir"
pnpm --filter @huoqiu/contracts generate:events -- --check
```

预期：18 个 Schema，所有 sample 合法且与独立 oracle 一致。此处的 `replay.spec.ts` 只验证通用 Inbox 去重原语，不能据此声称任何尚未实现的真实 producer/consumer 已通过端到端重放。

- [ ] **Step 5: 提交**

```bash
git add packages/contracts/src/events packages/contracts/events packages/contracts/scripts packages/contracts/test/events
git commit -m "feat(contracts): define M1 event schemas"
```

## Task 4: 生成共享 SDK

**Files:**

- Create: `packages/sdk/package.json`
- Create: `packages/sdk/src/client.ts`
- Create: `packages/sdk/src/types.ts`
- Create: `packages/sdk/src/index.ts`
- Create: `packages/sdk/scripts/generate.mts`
- Create: `packages/sdk/test/client.spec.ts`
- Modify: `packages/contracts/package.json`

- [ ] **Step 1: 写生成结果和禁止手写 DTO 测试**

测试断言 SDK 暴露 31 个 operation，类型直接从 `AppRouter` 推导；扫描 `apps/*/src/**/*dto.ts` 必须为零。

- [ ] **Step 2: 实现 ts-rest client factory**

```ts
export const createHuoqiuClient = (baseUrl: string, fetcher = globalThis.fetch) =>
  initClient(m1Router, { baseUrl, baseHeaders: {}, api: async (args) => fetcher(args.path, args) });
```

- [ ] **Step 3: 生成稳定 types manifest**

生成 `src/types.ts` 和 `generated-manifest.json`；manifest 包含 contract version、31 API ID 与 18 event type，不包含绝对文件路径或时间。

- [ ] **Step 4: 首次在临时目录生成，经 API/Event Oracle 验证后安装**

```bash
sdk_tmp_dir="$(mktemp -d)"
trap 'rm -rf "$sdk_tmp_dir"' EXIT
pnpm --filter @huoqiu/sdk generate -- --output "$sdk_tmp_dir"
SDK_CANDIDATE_DIR="$sdk_tmp_dir" pnpm --filter @huoqiu/sdk test
pnpm --filter @huoqiu/sdk generate -- --install-from "$sdk_tmp_dir"
pnpm --filter @huoqiu/sdk generate -- --check
```

`--check` 必须在独立临时目录重生成并逐字节比较；不得把首次生成的 untracked 文件误报为 `generated_diff=0`。

- [ ] **Step 5: 提交 contract SHA**

```bash
git add packages/sdk packages/contracts/package.json pnpm-lock.yaml
git commit -m "feat(sdk): generate M1 shared client"
git rev-parse HEAD
```

把输出 SHA 写入任务交接；从此 SHA 起客户端才允许并行开发。

## Task 5: 定义领域表所有权与 Drizzle Schema

**Files:**

- Create: `packages/db/package.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/schema/identity.ts`
- Create: `packages/db/src/schema/auth-provider-private.ts`
- Create: `packages/db/src/schema/instrument.ts`
- Create: `packages/db/src/schema/market.ts`
- Create: `packages/db/src/schema/content.ts`
- Create: `packages/db/src/schema/social.ts`
- Create: `packages/db/src/schema/moderation.ts`
- Create: `packages/db/src/schema/feed.ts`
- Create: `packages/db/src/schema/watchlist.ts`
- Create: `packages/db/src/schema/notification.ts`
- Create: `packages/db/src/schema/portfolio.ts`
- Create: `packages/db/src/schema/search.ts`
- Create: `packages/db/src/schema/operations.ts`
- Create: `packages/db/src/schema/platform-events.ts`
- Create: `packages/db/src/schema/index.ts`
- Create: `packages/domain/table-ownership.yaml`
- Create: `packages/db/test/schema-constraints.spec.ts`
- Create: `packages/db/test/ownership.spec.ts`
- Create: `packages/db/test/auth-provider-boundary.spec.ts`

- [ ] **Step 1: 写所有权、金额类型和唯一约束失败测试**

断言批准规格第 25 节的所有表恰有一个 owner；金额/价格/数量列为 numeric；所有可变聚合 version 为 bigint；关键 idempotency 和 Inbox/Outbox 约束存在。

- [ ] **Step 2: 只为 Accepted ADR 方案创建 provider-private Schema**

先读取 `docs/adr/0001-auth-provider.md`：若选择 Better Auth，`auth-provider-private.ts` 只包含其所需私有表；若选择 Keycloak，则不得创建 Better Auth 表，只允许本地 session/revocation 映射所需的 provider-private 记录。`identity.ts` 只保存平台身份、员工准入与 provider-neutral subject 映射。其他域、contracts 和 SDK 均不得 import 私有 Schema；测试扫描并阻止 provider 名称/私有字段越界。Search 和 Operations 只存投影/管理审计，不成为业务权威源。

- [ ] **Step 3: 建立跨域引用规则**

业务表可以存稳定 ID，但 API repository 不允许跨领域表写入；Moderation 决定通过同进程受控命令调用权威域，在同一 PostgreSQL transaction object 中完成。

- [ ] **Step 4: 验证**

```bash
pnpm --filter @huoqiu/db exec vitest run test/schema-constraints.spec.ts test/ownership.spec.ts test/auth-provider-boundary.spec.ts
pnpm --filter @huoqiu/db typecheck
```

- [ ] **Step 5: 提交**

```bash
git add packages/db packages/domain/table-ownership.yaml
git commit -m "feat(db): define M1 owned schemas"
```

## Task 6A: Root 单写者建立版本化 Fixture 与 Schema

**Files:**

- Create: `packages/contracts/fixtures/m1.v1.json`
- Create: `packages/contracts/fixtures/negative/m1-pii-email.json`
- Create: `packages/contracts/fixtures/negative/m1-unauthorized-source.json`
- Create: `packages/contracts/fixtures/negative/m1-forbidden-surface.json`
- Create: `packages/contracts/src/m1/fixture-schema.ts`
- Create: `packages/contracts/test/m1-fixture-schema.spec.ts`

- [ ] **Step 1: 先写允许数据和三类拒绝用例**

测试必须以独立 `quality/oracles/m1/fixture-policy.v1.json` 为批准依据，证明合法 Fixture 通过，并分别拒绝 email/token/真实姓名等 PII、非 `huoqiu-synthetic` 外部来源，以及 private fund/trade/public portfolio/push/AI advice 等禁用 surface。Fixture Schema 自己的 allowlist 不能充当批准 oracle。

- [ ] **Step 2: 建立唯一 Fixture 数据源**

`m1.v1.json` 固定创建两个非真实员工 subject、Reviewer、Operator、合成交易所、`listing_syn_0001`、默认频道与卡片白名单；不得创建真实姓名、邮箱、生产密钥或受限功能记录。所有稳定 ID 与来源逐项匹配独立 policy oracle。

- [ ] **Step 3: Root 目标验证并提交**

```bash
pnpm --filter @huoqiu/contracts exec vitest run test/m1-fixture-schema.spec.ts
git add packages/contracts/fixtures packages/contracts/src/m1/fixture-schema.ts packages/contracts/test/m1-fixture-schema.spec.ts
git commit -m "test(fixtures): approve versioned M1 seed input"
```

本任务不得创建迁移、Seed writer 或提交 `packages/db/**`；其 commit SHA 是 Task 6B 的显式输入。

## Task 6B: API 单写者建立迁移、空库回放和 Seed Writer

**Depends on:** Task 6A fixture commit SHA.

**Files:**

- Create: `packages/db/drizzle/0000_m1_prerequisites.sql`
- Create: `packages/db/drizzle/0001_m1_foundation.sql`
- Create: `packages/db/drizzle/0002_m1_invariants.sql`
- Create: `packages/db/drizzle/meta/_journal.json`
- Create: `packages/db/scripts/migrate.mts`
- Create: `packages/db/scripts/seed.mts`
- Create: `packages/db/src/seed/m1.v1.ts`
- Create: `packages/db/test/migrations/empty-replay.spec.ts`
- Create: `packages/db/test/migrations/idempotent-seed.spec.ts`
- Create: `packages/db/test/migrations/rejected-fixture.spec.ts`

- [ ] **Step 1: 写空库迁移、重复 Seed 和非法 Fixture 失败测试**

Testcontainers 启动临时 PostgreSQL，迁移一次、再次迁移、Seed 两次；断言 schema drift 为零、稳定 ID 行数不增长。三个 negative fixtures 必须在建立数据库连接或开启 transaction 前被拒绝，并留下零行副作用。另用已能在既有 `drizzle` schema 建表、但没有 database `CREATE` 权限的受限角色回放 `0000`；`pg_trgm` 安装必须 fail closed，`public` 业务表和 migration history 行数都必须为零（允许 Drizzle 自己的空 bookkeeping 表存在）。

- [ ] **Step 2: 生成并审查 SQL**

迁移顺序是强制协议，不得合并或调换：

1. `drizzle-kit generate --custom --name=m1_prerequisites` 生成 `0000`，只写 `CREATE EXTENSION IF NOT EXISTS pg_trgm` 和能力断言；它必须是第一条可能失败的数据库能力操作，之前不得创建任何业务表。
2. `drizzle-kit generate --name=m1_foundation` 生成 `0001`，从已批准 Drizzle Schema 生成 40 张 public、4 张 provider-private 表及 5 个 `gin_trgm_ops` 索引；不得手改生成 SQL。
3. `drizzle-kit generate --custom --name=m1_invariants` 生成 `0002`，只加入 append-only、单向状态转换、CHECK 和 trigger 等 Drizzle 无法表达的约束。

```bash
rg -n 'double precision|real' packages/db/drizzle
```

预期命令无输出。提交必须包含 Drizzle `meta/_journal.json`，且真库测试逐条核对 migration 文件 SHA 与数据库 history；只提交单个 `0000_m1_foundation.sql` 或先建表再安装扩展均为失败。

- [ ] **Step 3: 消费 Root 冻结的 Fixture，而非复制**

`packages/contracts/fixtures/m1.v1.json` 是唯一 Seed 数据源；`packages/db/src/seed/m1.v1.ts` 只能通过精确导出 `@huoqiu/contracts/m1/fixture-data` 读取原始 JSON，并 import `m1FixtureSchema` 后幂等写库，不得复制 JSON、Schema、批准规则或用跨包相对路径绕过边界。`0000` 启用 `pg_trgm`，`0001` 为 instrument/listing 名称、代码、拼音和别名建立 M1 搜索索引；扩展不可用时迁移直接失败，不静默退化为全表扫描。Fixture 的卡片白名单只做 Schema/registry 校验，结果显式报告 `persistedCards=0`，不虚构数据库表。

- [ ] **Step 4: API 目标验证并提交**

```bash
pnpm --filter @huoqiu/db exec vitest run test/migrations
git add packages/db
git commit -m "feat(db): add replayable migration and M1 seed writer"
```

API 任务不得修改或顺带提交 `packages/contracts/**`；若 Fixture/Schema 有问题，退回 Root 单写者新建独立修订任务，合并后再重跑本任务。

## Task 8: 实现双层 Alpha 准入与本地会话骨架

**Files:**

- Create: `apps/api/src/identity/alpha-access.guard.ts`
- Create: `apps/api/src/identity/session.guard.ts`
- Create: `apps/api/src/identity/auth-provider.port.ts`
- Create: `apps/api/src/identity/auth-provider.adapter.ts`
- Create: `apps/api/src/identity/auth.controller.ts`
- Create: `apps/api/src/identity/auth.service.ts`
- Create: `apps/api/src/identity/identity.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json`
- Create: `apps/api/test/security/alpha-access.spec.ts`
- Create: `apps/api/test/security/suspension.spec.ts`
- Create: `apps/api/test/integration/identity/auth.spec.ts`
- Create: `apps/web/src/middleware.ts`
- Create: `apps/web/src/middleware.spec.ts`
- Modify: `apps/web/package.json`
- Create: `apps/admin/src/middleware.ts`
- Create: `apps/admin/src/middleware.spec.ts`
- Modify: `apps/admin/package.json`

这是 API/Web/Admin 三个单写者子任务。各泳道只改自己的路径和依赖声明；Root 合并三个提交后统一更新 `pnpm-lock.yaml`。API 必须在 `AppModule` composition root 显式 import `IdentityModule`，不能只创建一个未注册模块。

- [ ] **Step 1: 写外部请求、无 claim、重复邀请和封禁测试**

无边缘 header/签名、无 `alpha_access`、重复使用 invite、suspended user 都必须在业务 controller 前被拒绝；封禁后现有 session 与 SSE token 立即失效。

- [ ] **Step 2: 实现 fail-closed guard 链**

顺序固定为边缘证明校验 → `alpha_access` → session → action/ownership。测试环境用签名 test header，production/staging 缺少 Zero Trust 配置时进程拒绝启动。`auth-provider.adapter.ts` 只封装 ADR 选中的方案；另一候选只保留在 `spikes/auth`，不进入应用依赖图。

- [ ] **Step 3: 实现四个 Auth operation**

严格匹配 API-AUTH-001..004；一次性邀请在同一事务 consume；Web 仅 HttpOnly Cookie，App token 只进入 SecureStore；日志过滤 token、cookie、invite。

- [ ] **Step 4: 验证**

```bash
pnpm --filter @huoqiu/api exec vitest run test/integration/identity test/security/alpha-access.spec.ts test/security/suspension.spec.ts
pnpm --filter @huoqiu/web exec vitest run src/middleware.spec.ts
pnpm --filter @huoqiu/admin exec vitest run src/middleware.spec.ts
```

这里只验证本任务已实现的后端与准入中间件，不运行完整 CAP-ID gate。`CAP-ID-001` 的 Web/Admin/Mobile 全链路与 manifest 由最终证据任务在所有客户端实现后运行，当前任务不得将后端通过超报为完整能力通过。

- [ ] **Step 5: 提交**

```bash
# API lane
git add apps/api/src/identity apps/api/src/app.module.ts apps/api/test apps/api/package.json
git commit -m "feat(identity): enforce closed alpha access"

# Web/Admin lanes submit their own middleware + package.json commits; Root then updates the lockfile.
```

## Task 9: 建立确定性 Synthetic Provider

**Files:**

- Create: `packages/market-adapters/package.json`
- Create: `packages/market-adapters/src/provider.ts`
- Create: `packages/market-adapters/src/synthetic/synthetic-provider.ts`
- Create: `packages/market-adapters/src/synthetic/generator.ts`
- Create: `packages/market-adapters/test/synthetic-provider.conformance.spec.ts`
- Create: `packages/market-adapters/test/sequence-revision.spec.ts`

- [ ] **Step 1: 写相同 Seed 确定性、乱序和修订失败测试**

相同 `listing_id/trading_day/seed` 得到逐字节相同 quote/bar；旧 sequence 不覆盖；同 sequence 的更高 revision 留痕并发 `market.quote_revised`。

- [ ] **Step 2: 定义 Provider 接口**

```ts
export interface MarketDataProvider {
  readonly source: 'huoqiu-synthetic';
  getQuote(listingId: ListingId, asOf: string): Promise<NormalizedQuote>;
  getBars(listingId: ListingId, interval: '1d', cursor?: string): Promise<CursorPage<NormalizedBar>>;
}
```

- [ ] **Step 3: 实现整数 PRNG 与 decimal 输出**

不得调用 `Math.random()` 或当前时钟参与结果；时钟和 seed 都通过构造器注入。每条输出含 source、as_of、exchange_timezone、sequence、revision、entitlement=`synthetic`。

- [ ] **Step 4: 验证与提交**

```bash
pnpm --filter @huoqiu/market-adapters test
git add packages/market-adapters
git commit -m "feat(market): add deterministic synthetic provider"
```

## Task 10: 建立本地 PostgreSQL、Valkey 与可观测壳

**Files:**

- Create: `infra/compose.yaml`
- Create: `infra/postgres/init.sql`
- Create: `.env.example`
- Create: `apps/api/src/observability/telemetry.ts`
- Modify: `apps/api/src/workers/events.main.ts`
- Modify: `apps/api/src/workers/market.main.ts`
- Create: `apps/api/src/workers/worker-registry.ts`
- Create: `apps/api/src/workers/outbox-dispatcher.ts`
- Create: `apps/api/src/workers/consumer-runner.ts`
- Create: `apps/api/src/workers/dlq-store.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json`
- Create: `apps/api/test/workers/process-isolation.spec.ts`
- Create: `apps/api/test/workers/outbox-runtime.spec.ts`
- Create: `apps/api/test/workers/composition-registration.spec.ts`
- Create: `apps/api/test/config/startup-fail-closed.spec.ts`

- [ ] **Step 1: 写生产缺失 Secret 和数据库配置拒绝测试**

`APP_ENV=production` 且缺少 session secret、database URL、Zero Trust verifier 时，API 必须在监听端口前退出。

- [ ] **Step 2: 创建 Compose**

服务只包含 PostgreSQL、Valkey、Jaeger；绑定 `127.0.0.1`，使用命名 volume 和 healthcheck。不得内置默认生产密码。

- [ ] **Step 3: 创建 `.env.example`**

只放字段名和安全说明，不放可工作的共享 Secret。Local dev secret 由启动脚本生成到 gitignored 文件。

- [ ] **Step 4: 建立唯一 HTTP/Worker composition roots**

`AppModule` 是 HTTP 模块唯一 composition root；`events.main.ts` 和 `market.main.ts` 分别调用 `worker-registry.ts` 构造各自进程。后续 capability 创建 controller/module/consumer 时，必须在同一任务的 Files 中明确 `Modify: apps/api/src/app.module.ts` 或 `Modify: apps/api/src/workers/worker-registry.ts` 并增加注册测试；只创建文件但未注册即失败。

`outbox-dispatcher.ts`、`consumer-runner.ts` 与 `dlq-store.ts` 先用合成 handler 证明通用机制：业务写与 Outbox 同事务；Inbox 按 `event_id + consumer` 去重；aggregate sequence 乱序时延迟而非覆盖；重试耗尽进入 DLQ；显式 replay 后仅产生一次副作用。这里不声称任何尚未实现的领域 producer/consumer 已通过。

- [ ] **Step 5: 启动并验证**

```bash
docker compose -f infra/compose.yaml up -d --wait
pnpm --filter @huoqiu/db migrate
pnpm --filter @huoqiu/db seed:m1
pnpm --filter @huoqiu/api exec vitest run test/config/startup-fail-closed.spec.ts test/workers/process-isolation.spec.ts test/workers/outbox-runtime.spec.ts test/workers/composition-registration.spec.ts
```

`process-isolation.spec.ts` 必须证明 HTTP、events worker、market worker 三个进程只注册各自职责；events worker 承载 Outbox/Inbox consumers，market worker 承载 Synthetic ingest，任一进程重启不重复副作用。

- [ ] **Step 6: 提交**

```bash
git add infra .env.example apps/api/src/observability apps/api/src/workers apps/api/src/app.module.ts apps/api/test apps/api/package.json
git commit -m "chore(infra): add closed-alpha local stack"
```

API lane 提交依赖声明后由 Root 单独更新 `pnpm-lock.yaml`；API commit 不得自行修改 lockfile。

## Task 11: 建立不可自证的 Contract、DDL、Event 与 Fixture Gate

**Files:**

- Create: `scripts/quality/contract-gate.mts`
- Create: `scripts/quality/ddl-gate.mts`
- Create: `scripts/quality/event-contract-gate.mts`
- Create: `scripts/quality/event-runtime-gate.mts`
- Create: `scripts/quality/fixture-gate.mts`
- Create: `scripts/quality/test/foundation-gates.spec.ts`
- Create: `scripts/quality/test/event-runtime-gate.spec.ts`
- Create: `scripts/quality/test/cases/event-missing-producer.json`
- Create: `scripts/quality/test/cases/event-out-of-order.json`
- Create: `scripts/quality/test/cases/event-dlq-replay.json`
- Create: `scripts/quality/test/cases/fixture-pii.json`
- Create: `scripts/quality/test/cases/fixture-unauthorized-source.json`
- Modify: `package.json`

- [ ] **Step 1: 写独立 Oracle 与真实运行路径的失败测试**

故意删除 operation/event、篡改批准 SHA、让 generator 输出漂移、改迁移、遗漏 producer binding、Outbox 不落库、重复消费、乱序覆盖、DLQ 不可 replay，以及注入 PII/外部来源。每个 Gate 必须退出非零并输出具体违规 ID；不能只比较文件数量，也不能读取待测实现自己生成的“expected”快照。

- [ ] **Step 2: 实现契约级与运行级分离的根命令**

```json
{
  "qa:contracts": "tsx scripts/quality/contract-gate.mts",
  "qa:ddl": "tsx scripts/quality/ddl-gate.mts",
  "qa:events:contract": "tsx scripts/quality/event-contract-gate.mts",
  "qa:events:runtime": "tsx scripts/quality/event-runtime-gate.mts",
  "qa:events": "pnpm qa:events:contract && pnpm qa:events:runtime",
  "qa:fixtures": "tsx scripts/quality/fixture-gate.mts"
}
```

`qa:contracts` 和 `qa:events:contract` 先验证 `approved.sha256`，再把实际 registry/生成物与只读 oracle 比较。`qa:events:runtime` 不信任手写 PASS 字段；它从 oracle 枚举 18 个 type，调用每个真实 producer fixture，查询事务内 Outbox，启动 composition root 注册的真实 consumer，重复投递、交换同 aggregate 的 sequence、强制一次 handler 失败并执行 DLQ replay，然后查询可观察副作用与 Inbox。任何 type 缺少 producer/outbox/consumer fixture 时输出 `NOT_READY` 并非零退出。

- [ ] **Step 3: 运行 Foundation 当前可证明的 Gate**

```bash
pnpm qa:contracts
pnpm qa:ddl
pnpm qa:events:contract
pnpm qa:fixtures
pnpm qa:events:runtime # 本阶段预期非零并输出 NOT_READY，直到下游 capability 注册全部真实 binding
```

前四条成功命令必须分别输出：

```text
CONTRACT_GATE PASS operations=31 oracle_match=31 generated_check=1 forbidden_operations=0
DDL_GATE PASS empty_migrate=1 replay=1 drift=0 ownership_conflicts=0
EVENT_CONTRACT_GATE PASS schemas=18 oracle_match=18 generated_check=1 producer_declarations=18
FIXTURE_GATE PASS valid=1 rejected_pii=1 rejected_source=1 rejected_surface=1 oracle_match=1
```

Foundation 只能报告上述 contract-level 结果；不得把通用合成 handler 的测试写成 `EVENT_RUNTIME_GATE PASS`。最终集成只有在 18/18 真实 binding 全部被执行后，才允许输出：

```text
EVENT_RUNTIME_GATE PASS bindings=18 producers=18 outbox=18 consumers=18 duplicate_side_effects=0 out_of_order_overwrites=0 dlq_replay_failures=0 pii_leaks=0 unauthorized_sources=0
```

成功证据由 gate 在运行后写入 gitignored `artifacts/evidence/events/`，并包含命令、contract SHA、数据库 run ID 和逐 event 结果；实现或 manifest 中预填的布尔值不能作为证据。

- [ ] **Step 4: 提交**

```bash
git add scripts/quality package.json pnpm-lock.yaml
git commit -m "feat(quality): gate M1 contracts ddl and events"
```

## Task 12: 冻结 M1 Foundation SHA

- [ ] **Step 1: 从干净检出安装与全量验证**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm qa:contracts
pnpm qa:ddl
pnpm qa:events:contract
pnpm qa:fixtures
pnpm qa:boundaries
```

Foundation freeze 不运行 `pnpm qa:events`（它包含尚未齐备的真实领域 binding），也不运行 `pnpm qa:cap -- --cap CAP-ID-001`。这两个完整 Gate 必须延后到 Community/Market/Portfolio 及 Web/Admin/Mobile 客户端全部注册后，由最终证据任务运行；缺任一 surface 时必须保持非零 `NOT_READY`，不得降级为跳过。

- [ ] **Step 2: 记录契约与迁移哈希**

```bash
git rev-parse HEAD
shasum -a 256 packages/contracts/openapi/huoqiu.v1.yaml
shasum -a 256 packages/db/drizzle/*.sql
```

- [ ] **Step 3: 独立复核**

复核人逐项核对 31 operation、18 event、13 error code、Actor × Action、禁止 surface、表单写者、认证 ADR 和 Synthetic 来源披露。

- [ ] **Step 4: 记录后端候选证据与最终 Gate 交接**

记录 Identity 后端目标测试、三个客户端待补证据、18 个 runtime event binding 的未完成清单和共同 contract SHA。不要创建写着 PASS 的 `CAP-ID-001` manifest；最终证据任务从实际执行结果生成 manifest，并运行：

```bash
pnpm qa:cap -- --milestone m1 --cap CAP-ID-001
pnpm qa:events
```

- [ ] **Step 5: 打标签式提交记录**

```bash
git commit --allow-empty -m "chore(m1): freeze foundation contract candidate"
```

输出的 commit SHA 是 Market/Watchlist、Community/Moderation、Portfolio/Notification 和客户端泳道的共同 base SHA。

## M1 Foundation 退出清单

- [ ] OpenAPI 可由源契约重复生成且 git diff 为零。
- [ ] SDK 与客户端 DTO 只有一个源，31 个 operation 都有 CAP 与 Action。
- [ ] 18 个事件有信封、payload Schema、批准 producer 声明和通用 Inbox/Outbox 原语；真实 producer/consumer runtime PASS 明确留给最终证据任务，不在 Foundation 超报。
- [ ] 空库迁移、重复迁移、Seed 重放和 schema drift 全通过。
- [ ] 认证方案只有一个运行实现，ADR 与硬性 Spike 证据一致。
- [ ] 外部公网、无 claim、无权限和 suspended actor 均 fail closed。
- [ ] Synthetic Provider 可确定重放，数据带 source、as_of、sequence、revision。
- [ ] 禁用能力在 OpenAPI、事件、表、Seed、route 和导航中为零。
- [ ] CAP-ID 中间阶段只有 API/Web/Admin 准入目标测试；完整 Web/Admin/Mobile CAP gate 未提前运行或伪造 PASS。
