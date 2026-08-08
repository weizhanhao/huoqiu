# 火球 M1 行情、Feed 与自选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Web、iOS、Android 使用同一 API 和稳定 ID 完成登录后首页 Feed、标的搜索、合成行情详情与跨端自选同步。

**Architecture:** Instrument Reference 管标的/上市实体，Market Data 管观测、quote、bar 与修订，Watchlist 管默认列表，Feed 管白名单投影。客户端只使用生成 SDK；写自选后 API 在同一事务 ensure default 并提供读己之写。

**Tech Stack:** NestJS/Fastify、Drizzle/PostgreSQL、ts-rest SDK、Next.js、Expo Router、TanStack Query 5、ECharts、FlashList、Vitest、Playwright、Maestro。

## Global Constraints

- 固定 base 为 M1 Foundation contract SHA；子代理不得修改 `packages/contracts`、OpenAPI、SDK 或 lockfile。
- 下游依赖必须先由各泳道写入自己拥有的 `package.json`；只有 Root 集成泳道可以更新并提交 `pnpm-lock.yaml`，功能泳道不得顺手改 lockfile。
- 行情只使用 `huoqiu-synthetic`；UI 总是展示 source、as_of、stale 与演示/合成标识。
- Instrument 与 Listing 必须分离；所有详情、quote、bar 和自选使用 `listing_id`。
- Feed 只允许 `post/news/market_strip/topic/ops_banner`，频道只允许 `home/following/market/news`。
- 本计划不创建内容写入、AI、提醒、Push、公开组合或交易入口。

---

## Task 0: 声明下游依赖并由 Root 固化 lockfile

**Files:**

- Modify: `packages/domain/package.json`
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`
- Modify: `apps/mobile/package.json`
- Modify (Root only, after all four manifests merge): `pnpm-lock.yaml`

- [ ] **Step 1: API 泳道声明 Domain/API 依赖**

仅加入本计划真实使用且版本已批准的 NestJS、Drizzle、属性测试与 worker/outbox 依赖；`packages/domain` 不得反向依赖 `apps/api`。提交两个 manifest，不提交 lockfile。

```bash
git add packages/domain/package.json apps/api/package.json
git commit -m "build(api): declare market domain dependencies"
```

- [ ] **Step 2: Web 泳道声明 Web 依赖**

加入生成 SDK、TanStack Query、图表与对应测试依赖；不得复制 SDK DTO。只提交 `apps/web/package.json`。

```bash
git add apps/web/package.json
git commit -m "build(web): declare market client dependencies"
```

- [ ] **Step 3: Mobile 泳道声明 Mobile 依赖**

加入生成 SDK、TanStack Query、SecureStore、FlashList、图表与对应测试依赖；只提交 `apps/mobile/package.json`。

```bash
git add apps/mobile/package.json
git commit -m "build(mobile): declare market client dependencies"
```

- [ ] **Step 4: Root 集成泳道更新唯一 lockfile**

Root 按 API → Web → Mobile 顺序合并 manifest 后运行：

```bash
pnpm install --lockfile-only
pnpm install --frozen-lockfile
git add pnpm-lock.yaml
git commit -m "build(m1): declare market watchlist dependencies"
```

若第二条命令改变工作树或出现未批准依赖，停止合并；功能泳道不得自行修 lockfile。

---

## Task 1: 实现 Instrument Reference 搜索与详情

**Files:**

- Create: `packages/domain/src/instrument/entities.ts`
- Create: `packages/domain/src/instrument/search.ts`
- Create: `packages/domain/test/instrument/listing-identity.property.spec.ts`
- Create: `apps/api/src/instrument/instrument.repository.ts`
- Create: `apps/api/src/instrument/instrument.service.ts`
- Create: `apps/api/src/instrument/instrument.controller.ts`
- Create: `apps/api/src/instrument/instrument.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/integration/instrument/search.spec.ts`
- Create: `apps/api/test/architecture/instrument-composition.spec.ts`

- [ ] **Step 1: 写 Listing 身份属性和搜索失败测试**

同一 Instrument 在 CN/HK/US 的三个 Listing 必须保持三个 listing ID；按代码、名称、拼音、别名查询；cursor 稳定；跨页无重复。

- [ ] **Step 2: 运行失败测试**

```bash
pnpm --filter @huoqiu/domain exec vitest run test/instrument
pnpm --filter @huoqiu/api exec vitest run test/integration/instrument/search.spec.ts
```

- [ ] **Step 3: 实现规范化查询与 repository**

M1 使用 PostgreSQL `tsvector` + `pg_trgm`；空查询返回空 items；只查询可见 Listing；排序固定为 exact symbol、exact name、prefix、trigram、稳定 listing ID。

- [ ] **Step 4: 实现 API-INST-001..002**

响应包含 instrument、listing、exchange、market、currency、status 和 request meta；未知 Listing 返回统一 `NOT_FOUND`。在 API composition root `AppModule` 显式导入 `InstrumentModule`，架构测试必须从生产 `AppModule` 解析 controller 并命中两条真实路由，不能只 new service 自证。

- [ ] **Step 5: 验证与提交**

```bash
pnpm --filter @huoqiu/domain exec vitest run test/instrument
pnpm --filter @huoqiu/api exec vitest run test/integration/instrument/search.spec.ts test/architecture/instrument-composition.spec.ts
git add packages/domain/src/instrument packages/domain/test/instrument apps/api/src/instrument apps/api/test/integration/instrument
git add apps/api/src/app.module.ts apps/api/test/architecture/instrument-composition.spec.ts
git commit -m "feat(instrument): add listing search and detail"
```

## Task 2: 持久化 Synthetic quote/bar 与修订

**Files:**

- Create: `apps/api/src/market/market.repository.ts`
- Create: `apps/api/src/market/market-ingestion.service.ts`
- Create: `apps/api/src/market/market-ingestion.worker.ts`
- Create: `apps/api/src/market/market-query.service.ts`
- Create: `apps/api/src/market/market.controller.ts`
- Create: `apps/api/src/market/market.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/workers/worker-registry.ts`
- Create: `apps/api/test/integration/market/quote-bars.spec.ts`
- Create: `apps/api/test/integration/market/market-revision.spec.ts`
- Create: `apps/api/test/architecture/market-composition.spec.ts`

- [ ] **Step 1: 写精度、序列、陈旧和 entitlement 失败测试**

断言旧 sequence 不覆盖、新 revision 保留原 observation、无 entitlement fail closed、超过配置时点返回 `stale=true`、返回交易所时区与 as_of。

- [ ] **Step 2: 运行失败测试**

```bash
pnpm --filter @huoqiu/api exec vitest run test/integration/market
```

- [ ] **Step 3: 实现 ingestion transaction**

原 observation 追加写入；规范化 quote/bar 使用 provider+listing+sequence+revision 唯一键；更高 revision 写 Foundation 共享 Outbox `market.quote_revised`；重复输入无第二事件。`market-ingestion.worker.ts` 是 Synthetic ingestion 的生产 worker；在 `worker-registry.ts` 注册其生产启动项和共享 outbox dispatcher 的绑定，不另造内存事件总线。

- [ ] **Step 4: 实现 API-MD-001..002**

bars 只开放 `1d`，cursor 不透明；quote/bar 输出 decimal string；provider 不可用时返回 `DATA_UNAVAILABLE`，无展示权返回 `ENTITLEMENT_DENIED`。在生产 `AppModule` 导入 `MarketModule`；架构测试必须从生产 composition roots 同时解析 HTTP controller、ingestion worker 和 outbox dispatcher，漏注册即失败。

- [ ] **Step 5: 验证与提交**

```bash
pnpm --filter @huoqiu/api exec vitest run test/integration/market test/architecture/market-composition.spec.ts
git add apps/api/src/market apps/api/test/integration/market
git add apps/api/src/app.module.ts apps/api/src/workers/worker-registry.ts apps/api/test/architecture/market-composition.spec.ts
git commit -m "feat(market): serve synthetic quote and bars"
```

## Task 3: 实现默认自选与读己之写

**Files:**

- Create: `packages/domain/src/watchlist/watchlist.ts`
- Create: `apps/api/src/watchlist/watchlist.repository.ts`
- Create: `apps/api/src/watchlist/watchlist.service.ts`
- Create: `apps/api/src/watchlist/watchlist.controller.ts`
- Create: `apps/api/src/watchlist/watchlist.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Create: `apps/api/test/integration/watchlist/default-idempotency.spec.ts`
- Create: `apps/api/test/security/watchlist-idor.spec.ts`
- Create: `apps/api/test/architecture/watchlist-composition.spec.ts`

- [ ] **Step 1: 写并发 ensure、幂等和 IDOR 失败测试**

同一用户并发 20 次 GET/PUT 只产生一个 default list 和一条 item；重复 PUT 不重复；重复 DELETE 成功；用户 B 看不到用户 A 项。

- [ ] **Step 2: 实现事务内 ensure default**

```ts
await tx.insert(watchlists).values(defaultList).onConflictDoNothing({ target: watchlists.ownerId });
const list = await tx.query.watchlists.findFirst({ where: eq(watchlists.ownerId, actor.id) });
```

GET、PUT 都执行 ensure，不依赖 `identity.user_registered` 消费时序。

- [ ] **Step 3: 实现 API-WATCH-001..003 与 Outbox**

PUT/DELETE 成功后在同一事务写 `watchlist.item_changed`；事件 payload 只含不可逆 actor ID、listing/present，不含邮箱、session 或 token。响应返回 committed version 供 Query cache 更新。在生产 `AppModule` 导入 `WatchlistModule` 并由共享 outbox dispatcher 发布；本任务没有该事件的下游 consumer，不得把“已写 outbox”报告为端到端消费成功，通知 consumer 由后续组合提醒计划注册。

- [ ] **Step 4: 验证与提交**

```bash
pnpm --filter @huoqiu/api exec vitest run test/integration/watchlist test/security/watchlist-idor.spec.ts test/architecture/watchlist-composition.spec.ts
git add packages/domain/src/watchlist apps/api/src/watchlist apps/api/test/integration/watchlist apps/api/test/security/watchlist-idor.spec.ts
git add apps/api/src/app.module.ts apps/api/test/architecture/watchlist-composition.spec.ts
git commit -m "feat(watchlist): add idempotent default list"
```

## Task 4: 实现规则 Feed 与白名单投影

**Files:**

- Create: `packages/domain/src/feed/card-registry.ts`
- Create: `apps/api/src/feed/feed.repository.ts`
- Create: `apps/api/src/feed/feed-projector.ts`
- Create: `apps/api/src/feed/feed-event.consumer.ts`
- Create: `apps/api/src/feed/feed.service.ts`
- Create: `apps/api/src/feed/feed.controller.ts`
- Create: `apps/api/src/feed/feed.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/workers/worker-registry.ts`
- Create: `apps/api/test/integration/feed/projection.spec.ts`
- Create: `apps/api/test/integration/feed/card-registry.spec.ts`
- Create: `apps/api/test/architecture/feed-composition.spec.ts`

- [ ] **Step 1: 写未知卡、删除传播、重复事件失败测试**

未知 type 不入库；重复 source event 不产生重复 item；published 建投影、hidden 删公开投影、restored 恢复；Feed 返回更新时间与 cursor。内容生命周期用 Foundation 已批准的只读 event fixture 驱动 projector contract test；因为其真实 producer 尚未在本计划实现，这部分不得计作 producer→consumer 运行时证据。

- [ ] **Step 2: 实现 Registry**

```ts
export const m1Channels = ['home', 'following', 'market', 'news'] as const;
export const m1CardTypes = ['post', 'news', 'market_strip', 'topic', 'ops_banner'] as const;
```

- [ ] **Step 3: 实现 Inbox 去重 projector 与 API-FEED-001**

投影事务先插入 consumer+event receipt，再更新 feed item；冲突即返回已消费。Feed 只返回 actor 有权查看的白名单卡片。将 `FeedModule` 导入生产 `AppModule`，并在 `worker-registry.ts` 注册真实 `feed-event.consumer.ts`；本计划内只把已存在 producer 的 `market.quote_revised` 绑定为运行时链路，Content 生命周期事件待 Community producer 落地后再注册。架构测试从生产 composition roots 解析 controller 与 consumer，并断言 worker allowlist 不接受未声明事件。

- [ ] **Step 4: 验证与提交**

```bash
pnpm --filter @huoqiu/api exec vitest run test/integration/feed test/architecture/feed-composition.spec.ts
git add packages/domain/src/feed apps/api/src/feed apps/api/test/integration/feed
git add apps/api/src/app.module.ts apps/api/src/workers/worker-registry.ts apps/api/test/architecture/feed-composition.spec.ts
git commit -m "feat(feed): add whitelisted rule feed"
```

## Task 5: Web 接入登录、Feed、搜索、详情和自选

**Files:**

- Create: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/app/page.tsx`
- Modify: `apps/web/src/app/search/page.tsx`
- Modify: `apps/web/src/app/instruments/[listingId]/page.tsx`
- Modify: `apps/web/src/app/watchlist/page.tsx`
- Create: `apps/web/src/lib/sdk.ts`
- Create: `apps/web/src/lib/query-client.ts`
- Create: `apps/web/src/components/system/connection-state.tsx`
- Create: `apps/web/tests/component/m1/market-watchlist.spec.tsx`

- [ ] **Step 1: 写真实会话与 API 状态矩阵测试**

覆盖 guest、session expired、loading、empty、error、stale、forbidden、offline optimistic rollback；断言 D0 本地 store 不在 M1 模式启用。

- [ ] **Step 2: 创建唯一 SDK client**

Server Component 使用 cookie 转发的 server client；Client Component 只通过 Query hooks；禁止直接 `fetch('/v1/...')`。

- [ ] **Step 3: 接入五个页面**

保持参考产品三栏信息密度，但使用火球 token；详情图显示 source/as_of/stale；自选 mutation 使用稳定资源键和乐观回滚。

- [ ] **Step 4: 验证**

```bash
pnpm --filter @huoqiu/web exec vitest run tests/component/m1/market-watchlist.spec.tsx
pnpm --filter @huoqiu/web lint
pnpm --filter @huoqiu/web typecheck
pnpm --filter @huoqiu/web build
```

- [ ] **Step 5: 提交**

```bash
git add apps/web
git commit -m "feat(web): connect M1 market and watchlist"
```

## Task 6: Mobile 接入登录、Feed、搜索、详情和自选

**Files:**

- Create: `apps/mobile/app/(auth)/sign-in.tsx`
- Modify: `apps/mobile/app/(tabs)/home.tsx`
- Modify: `apps/mobile/app/(tabs)/watchlist.tsx`
- Modify: `apps/mobile/app/search.tsx`
- Modify: `apps/mobile/app/instrument/[listingId].tsx`
- Create: `apps/mobile/src/lib/sdk.ts`
- Create: `apps/mobile/src/lib/query-client.ts`
- Create: `apps/mobile/src/auth/session-store.ts`
- Create: `apps/mobile/tests/component/m1/market-watchlist.spec.tsx`

- [ ] **Step 1: 写 SecureStore 恢复、过期和换号测试**

退出后 token 清除且 Query cache reset；换号不能看到旧自选；Deep Link 进入详情前完成 session 恢复。

- [ ] **Step 2: 接入生成 SDK 与 TanStack Query**

Bearer token 由 async secure adapter 注入，不写 AsyncStorage、不进入日志。网络错误保留页面上下文并可重试。

- [ ] **Step 3: 接入五个页面和图表**

FlashList 设稳定 key；图表销毁正确；红涨绿跌、source/as_of/stale、触控目标和 safe area 均符合 token。

- [ ] **Step 4: 验证与提交**

```bash
pnpm --filter @huoqiu/mobile exec vitest run tests/component/m1/market-watchlist.spec.tsx
pnpm --filter @huoqiu/mobile typecheck
pnpm --filter @huoqiu/mobile exec expo export --platform web
git add apps/mobile
git commit -m "feat(mobile): connect M1 market and watchlist"
```

## Task 7: 建立三端自选同步黄金路径

**Files:**

- Create (API lane): `apps/api/test/integration/events/market-feed-runtime.spec.ts`
- Create (API lane): `apps/api/test/integration/events/market-event-dlq-replay.spec.ts`
- Create (API lane): `apps/api/test/security/events/market-event-boundary.spec.ts`
- Create: `tests/e2e/playwright/m1/watchlist-sync.spec.ts`
- Create: `tests/e2e/maestro/m1/market-watchlist.yaml`
- Create: `quality/manifests/caps/CAP-INST-001.json`
- Create: `quality/manifests/caps/CAP-MD-001.json`
- Create: `quality/manifests/caps/CAP-FEED-001.json`
- Create: `quality/manifests/caps/CAP-WATCH-001.json`
- Create (Root evidence lane): `quality/manifests/events/m1-market-watchlist-runtime.json`

- [ ] **Step 1: 写 Web 端黄金路径**

员工 A 登录 → Feed → 搜索 SYN001 → 详情 → 验证 source/as_of → 加自选 → 刷新仍存在 → 退出。

- [ ] **Step 2: 写 Mobile 同账号验证**

员工 A 登录 App → 自选看到同一 `listing_syn_0001` → 取消 → Web 刷新后为空；员工 B 始终不可见。

- [ ] **Step 3: 运行 Web 三浏览器**

```bash
pnpm exec playwright test -c tests/e2e/playwright.config.ts tests/e2e/playwright/m1/watchlist-sync.spec.ts --project=chromium --project=webkit --project=firefox
```

- [ ] **Step 4: 运行 iOS 与 Android**

```bash
pnpm e2e:mobile:m1:ios -- tests/e2e/maestro/m1/market-watchlist.yaml
pnpm e2e:mobile:m1:android -- tests/e2e/maestro/m1/market-watchlist.yaml
```

M1 不允许用 Expo Web 替代 iOS/Android 证据。

- [ ] **Step 5: 用真实 composition roots 采集 EVENT 运行时证据**

API 泳道启动真实 PostgreSQL、outbox dispatcher 与 `feed-event.consumer`，并完成以下目标测试：

- 写入更高 revision 后，逐项证明 producer transaction → outbox row → dispatcher publish → consumer receipt → Feed projection；证据记录真实 event/outbox/receipt ID，而非把预期值写回结果文件。
- 同一 event ID 重投不产生第二 receipt/投影；先投 N+2 再投 N+1 不回退投影；poison event 进入 DLQ，修复后 replay 恰好消费一次，且 DLQ/replay 审计可关联原 event ID。
- 负测拒绝缺失或非 `huoqiu-synthetic` 的 market source，以及 email、手机号、session、token、原始 provider response 等越界字段；拒绝路径不得产生可发布 outbox，DLQ 与日志也必须脱敏。
- `watchlist.item_changed` 在本切片只证明 producer transaction → outbox → dispatcher；manifest 必须标注 `consumer_owner=portfolio-notifications`、`consumer_status=pending`，不能冒充已有 consumer 或计入端到端链路。

```bash
pnpm --filter @huoqiu/api exec vitest run test/integration/events/market-feed-runtime.spec.ts test/integration/events/market-event-dlq-replay.spec.ts test/security/events/market-event-boundary.spec.ts
git add apps/api/test/integration/events apps/api/test/security/events
git commit -m "test(events): verify market feed runtime chain"
```

- [ ] **Step 6: Root 对照只读 oracle 生成证据 manifest**

Root 只从测试输出、DB receipt 与 DLQ/replay 审计组装 runtime manifest。Gate 的预期 event ID、schema hash、producer/consumer 拓扑和 PII/source policy 必须来自 Foundation 已独立批准且带 hash 的只读 oracle；本任务的 manifest 只能引用证据，不能定义预期、更新 oracle 或自行增加“通过”计数。若 oracle/hash 被改、worker 未在生产 registry 注册、证据 ID 无法回查或 pending consumer 被标成 complete，Gate 必须非零退出。本切片只报告实际覆盖的事件，不宣称全局 18 event 已通过。

```bash
pnpm qa:events:runtime -- --scope m1-market-watchlist --manifest quality/manifests/events/m1-market-watchlist-runtime.json
```

- [ ] **Step 7: 运行四个完整 CAP Gate 并提交最终证据**

这是本计划唯一允许执行完整 `qa:cap` 的步骤；四个 manifest 引用前述原始 EVENT、Web、iOS、Android 证据，不复制或改写 gate 预期。

```bash
pnpm qa:cap -- --milestone m1 --cap CAP-INST-001
pnpm qa:cap -- --milestone m1 --cap CAP-MD-001
pnpm qa:cap -- --milestone m1 --cap CAP-FEED-001
pnpm qa:cap -- --milestone m1 --cap CAP-WATCH-001
git add tests/e2e quality/manifests/caps quality/manifests/events/m1-market-watchlist-runtime.json
git commit -m "test(e2e): verify M1 market watchlist chain"
```

## 退出清单

- [ ] 搜索、详情、quote/bar、Feed、自选的 API 与生成 SDK 无 DTO 漂移。
- [ ] 所有 quote/bar 都能追踪至 Synthetic observation、source、as_of、sequence、revision。
- [ ] 默认自选并发创建幂等，跨账号隔离，Web/iOS/Android 同账号一致。
- [ ] Feed 未知卡安全跳过，隐藏/恢复和重复事件测试通过。
- [ ] `market.quote_revised` 有真实 producer/outbox/consumer、幂等、乱序、DLQ/replay 与 source/PII 负测；`watchlist.item_changed` 只报告本切片真实完成的 producer/outbox 状态。
- [ ] `CAP-INST-001`、`CAP-MD-001`、`CAP-FEED-001`、`CAP-WATCH-001` 均有独立复核证据。
