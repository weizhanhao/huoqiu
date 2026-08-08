# 火球 M1 站内通知与私有组合 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付离线也可靠创建的 canonical Inbox、可恢复 SSE 与只对本人可见的单币种长仓无杠杆模拟组合账本，并在 Web/iOS/Android 保持一致。

**Architecture:** Notification 先把规范通知持久化，再尝试 SSE 投递；event ID 使用 notification sequence。Portfolio 以追加式双分录账本为唯一事实源，同一事务更新现金/持仓投影和 aggregate version；异步事件只做估值、通知和审计。

**Tech Stack:** NestJS/Fastify SSE、PostgreSQL/Drizzle、Outbox/Inbox、decimal bigint scale、Next.js、Expo Router、TanStack Query、Vitest property tests、Playwright、Maestro。

## Global Constraints

- M1 不含 APNS/FCM；站内 Inbox 和 SSE 是唯一 Required 通知渠道。
- 通知 recipient、canonical key、业务对象权限和当前 session 必须分别验证；Deep Link 落地后再次鉴权。
- 组合只允许本人、单币种、长仓、无杠杆、手工记录已成交 buy/sell/fee；无下单、撮合、跟单或收益承诺。
- 账本追加且不可修改；冲正写新 entry。现金和持仓不能直接编辑。
- 组合、账本、持仓和估值 API 对其他用户统一返回 `FORBIDDEN`，不得泄露资源是否存在。
- API/Domain/DB、Web、Mobile 泳道只修改各自 `package.json`；Root 在集成窗口统一更新 `pnpm-lock.yaml`。创建任何 Nest module 或 event consumer 的任务必须同时修改并测试 `AppModule`/worker composition root。
- 中间任务只运行本切片目标测试；完整 CAP Gate 仅在 Task 9 的 Web/iOS/Android 与原始证据齐备后运行。Event manifest 只能索引实际 DB/outbox/inbox/DLQ 证据，不能自填 PASS。

---

## Task 1: 实现 canonical Inbox 与单调已读

**Files:**

- Create: `packages/domain/src/notification/notification.ts`
- Create: `packages/domain/src/notification/read-watermark.ts`
- Create: `packages/domain/test/notification/read-watermark.property.spec.ts`
- Modify: `packages/domain/package.json`
- Create: `apps/api/src/notification/notification.repository.ts`
- Create: `apps/api/src/notification/notification.service.ts`
- Create: `apps/api/src/notification/notification.controller.ts`
- Create: `apps/api/src/notification/notification-event.consumer.ts`
- Create: `apps/api/src/notification/notification.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/workers/worker-registry.ts`
- Modify: `apps/api/package.json`
- Create: `apps/api/test/integration/notification/inbox-sse.spec.ts`
- Create: `apps/api/test/architecture/notification-composition.spec.ts`

- [ ] **Step 1: 写离线创建、recipient 隔离和 watermark 属性测试**

用户离线时消费互动事件仍写 notification；重复 canonical key 只一条；用户 B 不可读 A；watermark 只能增加，较小值是幂等成功但不回退。

- [ ] **Step 2: 运行失败测试**

```bash
pnpm --filter @huoqiu/domain exec vitest run test/notification
pnpm --filter @huoqiu/api exec vitest run test/integration/notification/inbox-sse.spec.ts
```

- [ ] **Step 3: 实现 canonical notification builder**

```ts
type CanonicalNotification = {
  id: string;
  sequence: string;
  recipientId: UserId;
  canonicalKey: string;
  type: 'post_published' | 'comment_published' | 'reaction_received' | 'content_hidden' | 'watchlist_changed' | 'portfolio_updated';
  object: { type: 'post' | 'comment' | 'listing' | 'portfolio'; id: string };
  deepLink: string;
  createdAt: string;
};
```

不得把正文全文、email、token、设备信息放入通知。`notification-event.consumer.ts` 消费 Community 生命周期、reaction 与 `watchlist.item_changed`，以 canonical key 幂等创建 Inbox；这补齐 Market/Watchlist 计划明确留给本计划的真实 notification consumer。

- [ ] **Step 4: 实现 API-NOTIF-001..002**

GET 使用 recipient filter 与 cursor；POST read-watermark 使用原子 `greatest(current, requested)`；响应带当前 watermark 和 request meta。创建 Inbox 与 `notification.created` Outbox 同事务，watermark 前进与 `notification.read_watermark_advanced` Outbox 同事务。

`AppModule` 必须 import `NotificationModule`，`worker-registry.ts` 必须注册真实 `notification-event.consumer.ts`；composition test 从生产 roots 解析 route 与 consumer，并拒绝伪造 producer/source。

- [ ] **Step 5: 验证与提交**

```bash
pnpm --filter @huoqiu/api exec vitest run test/integration/notification/inbox-sse.spec.ts test/architecture/notification-composition.spec.ts
git add packages/domain/src/notification packages/domain/test/notification packages/domain/package.json apps/api/src/notification apps/api/src/app.module.ts apps/api/src/workers/worker-registry.ts apps/api/test/integration/notification apps/api/test/architecture/notification-composition.spec.ts apps/api/package.json
git commit -m "feat(notification): add canonical inbox"
```

API lane 只提交依赖声明；Root 统一更新 lockfile。

## Task 2: 实现可恢复 SSE

**Files:**

- Create: `apps/api/src/notification/sse/session-registry.ts`
- Create: `apps/api/src/notification/sse/notification-stream.ts`
- Create: `apps/api/src/notification/sse/heartbeat.ts`
- Modify: `apps/api/src/notification/notification.module.ts`
- Modify: `apps/api/package.json`
- Create: `apps/api/test/integration/notification/sse-reconnect.spec.ts`
- Create: `apps/api/test/security/sse-recipient.spec.ts`

- [ ] **Step 1: 写 Last-Event-ID、heartbeat、游标过期和断流测试**

断开后从最后 sequence+1 恢复且不重复；20 秒 heartbeat；恢复窗口外返回 `STREAM_CURSOR_EXPIRED`；logout/suspend/换号立即关闭；B 的 cursor 不能读取 A。

- [ ] **Step 2: 实现 API-NOTIF-003**

响应 `Content-Type: text/event-stream`、`Cache-Control: no-cache`、禁用代理缓冲；event `id` 是持久 sequence，data 是最小 notification envelope；heartbeat 使用 comment frame。

- [ ] **Step 3: 实现 session registry 关闭钩子**

Identity logout/suspend 在事务提交后同步撤销本地 session，并通知 registry 关闭对应 stream；多实例关闭由 M1 进程内 bus + Valkey channel 驱动，消息只含 user/session ID。

- [ ] **Step 4: 验证与提交**

```bash
pnpm --filter @huoqiu/api exec vitest run test/integration/notification/sse-reconnect.spec.ts test/security/sse-recipient.spec.ts
git add apps/api/src/notification/sse apps/api/src/notification/notification.module.ts apps/api/test/integration/notification apps/api/test/security/sse-recipient.spec.ts apps/api/package.json
git commit -m "feat(notification): add recoverable SSE"
```

提交同时包含 `notification.module.ts` 与 `apps/api/package.json` 的注册/依赖变更；API lane 不修改 lockfile。

## Task 3: Web 与 Mobile 消息中心和 Deep Link

**Files:**

- Create: `apps/web/src/app/notifications/page.tsx`
- Create: `apps/web/src/lib/notification-stream.ts`
- Create: `apps/web/src/components/notification/notification-list.tsx`
- Create: `apps/web/tests/component/m1/notification-deeplink.spec.tsx`
- Modify: `apps/web/package.json`
- Create: `apps/mobile/app/notifications.tsx`
- Create: `apps/mobile/src/notifications/notification-stream.ts`
- Create: `apps/mobile/src/notifications/deep-link-router.ts`
- Create: `apps/mobile/tests/component/m1/notifications.spec.tsx`
- Modify: `apps/mobile/package.json`

这是 Web 与 Mobile 两个单写者子任务；各自只提交本泳道路径，Root 合并后统一更新 lockfile。

- [ ] **Step 1: 写重连、换号、失效对象和 Deep Link 鉴权测试**

cursor 过期先 GET 增量再订阅；换号清 cache/cursor；hidden/deleted 对象显示不可用；未登录 Deep Link 先登录再回原目的地。

- [ ] **Step 2: 实现 Web SSE client**

保留 last event ID，指数退避上限 30 秒；浏览器离线暂停；收到通知写 Query cache；组件卸载关闭连接。

- [ ] **Step 3: 实现 Mobile SSE client**

App 前台时订阅、后台时关闭；恢复前先同步 Inbox；token/session 变化重建连接；不以 SSE 替代 canonical Inbox。

- [ ] **Step 4: 验证与提交**

```bash
pnpm --filter @huoqiu/web exec vitest run tests/component/m1/notification-deeplink.spec.tsx
git add apps/web
git commit -m "feat(web): add inbox and notification deep links"

pnpm --filter @huoqiu/mobile exec vitest run tests/component/m1/notifications.spec.tsx
git add apps/mobile
git commit -m "feat(mobile): add inbox and notification deep links"
```

## Task 4: 建立 Portfolio 双分录账本领域

**Files:**

- Create: `packages/domain/src/portfolio/accounts.ts`
- Create: `packages/domain/src/portfolio/ledger.ts`
- Create: `packages/domain/src/portfolio/projection.ts`
- Create: `packages/domain/src/portfolio/valuation.ts`
- Create: `packages/domain/test/portfolio/ledger.property.spec.ts`
- Create: `packages/domain/test/portfolio/replay.spec.ts`
- Modify: `packages/domain/package.json`
- Create: `packages/db/src/schema/portfolio-postings.ts`
- Create: `packages/db/drizzle/0001_portfolio_postings.sql`
- Modify: `packages/db/package.json`

- [ ] **Step 1: 写借贷平衡、负余额、幂等和重放属性测试**

任意合法 buy/sell/fee/reversal 序列借方=贷方；现金和数量不为负；相同 client request 只有一 entry；冲正两次拒绝；重放得到逐字相同现金/持仓/version。

- [ ] **Step 2: 定义账本命令**

```ts
type LedgerCommand =
  | { type: 'buy'; listingId: ListingId; quantity: string; price: string; fee: string; occurredAt: string }
  | { type: 'sell'; listingId: ListingId; quantity: string; price: string; fee: string; occurredAt: string }
  | { type: 'fee'; amount: string; occurredAt: string };
```

每个 entry 生成至少两条 posting；posting account 只允许 cash、position-cost、fee、opening-equity。

- [ ] **Step 3: 实现纯函数 projector**

所有输入按 `(occurred_at, ledger_entry_id)` 稳定排序；只用 decimal/bigint；projection 输出 cash、每 listing quantity/cost 与 committed version。

- [ ] **Step 4: 实现估值公式**

同一 `valuation_as_of` 读取所有 Synthetic quote；当前权益=现金+持仓市值；M1 P&L=当前权益-初始现金；不计算 TWR、基准、公司行动或多币种换算。

- [ ] **Step 5: 验证迁移与领域测试**

```bash
pnpm --filter @huoqiu/domain exec vitest run test/portfolio
pnpm qa:ddl
git add packages/domain/src/portfolio packages/domain/test/portfolio packages/domain/package.json packages/db
git commit -m "feat(portfolio): add balanced append-only ledger"
```

API lane 声明 Domain/DB 依赖；Root 在合并后统一更新 lockfile。

## Task 5: 实现 Portfolio transaction 与 7 个 API

**Files:**

- Create: `apps/api/src/portfolio/portfolio.repository.ts`
- Create: `apps/api/src/portfolio/portfolio.service.ts`
- Create: `apps/api/src/portfolio/portfolio.controller.ts`
- Create: `apps/api/src/portfolio/portfolio.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json`
- Create: `apps/api/test/integration/portfolio/ledger.spec.ts`
- Create: `apps/api/test/integration/portfolio/concurrency.spec.ts`
- Create: `apps/api/test/security/portfolio-idor.spec.ts`
- Create: `apps/api/test/architecture/portfolio-composition.spec.ts`

- [ ] **Step 1: 写并发版本、原子投影和 IDOR 失败测试**

同一 portfolio 并发命令串行锁 aggregate；过期 version 冲突；entry/postings/cash/position/version 任一失败全部回滚；用户 B 对 7 个 endpoint 都 403。

- [ ] **Step 2: 实现 transaction command**

顺序固定为锁 portfolio → 查 Idempotency-Key → 校验 owner/version → 纯函数生成 entry/postings → 校验余额/持仓 → 追加账本 → 同步更新 cash/position/version → 写 Outbox → commit。

- [ ] **Step 3: 实现 API-PORT-000..006**

列表与账本 cursor 稳定；创建只接受 CNY/HKD/USD 和正初始现金；response 返回 `committed_version`；projection 低于请求版本时返回 `STATE-STALE` 映射的 `DATA_STALE`。

- [ ] **Step 4: 实现冲正**

冲正新 entry 引用 original ID，posting 符号相反；原 entry 不变；已冲正再请求返回 `CONFLICT` 或相同 idempotent response。

`AppModule` 必须 import `PortfolioModule`；架构测试从生产 composition root 解析 7 条 controller route。每次账本 commit 与 `portfolio.ledger_entry_posted` Outbox 同事务。

- [ ] **Step 5: 验证与提交**

```bash
pnpm --filter @huoqiu/api exec vitest run test/integration/portfolio/ledger.spec.ts test/integration/portfolio/concurrency.spec.ts test/security/portfolio-idor.spec.ts test/architecture/portfolio-composition.spec.ts
git add apps/api/src/portfolio apps/api/src/app.module.ts apps/api/test/integration/portfolio apps/api/test/security/portfolio-idor.spec.ts apps/api/test/architecture/portfolio-composition.spec.ts apps/api/package.json
git commit -m "feat(portfolio): add private transactional APIs"
```

这里只跑 Portfolio API 目标测试；完整 `CAP-PORT-001` 延后到 Task 9。API lane 不修改 lockfile。

## Task 6: 实现 Portfolio 异步估值与通知

**Files:**

- Create: `apps/api/src/portfolio/valuation.consumer.ts`
- Create: `apps/api/src/portfolio/portfolio-notification.consumer.ts`
- Create: `apps/api/src/events/portfolio-notification-event-bindings.ts`
- Modify: `apps/api/src/workers/worker-registry.ts`
- Modify: `apps/api/package.json`
- Create: `apps/api/test/integration/portfolio/valuation-replay.spec.ts`
- Create: `apps/api/test/integration/portfolio/notification-dedup.spec.ts`
- Create: `apps/api/test/architecture/portfolio-worker-composition.spec.ts`

- [ ] **Step 1: 写重复/乱序 event 和不同 as_of 测试**

重复 ledger event 不重复估值/通知；旧 market revision 不覆盖新 snapshot；同一 snapshot 所有 quote as_of 相同；核心 cash/position 不依赖 consumer。

- [ ] **Step 2: 实现 Inbox 去重消费者**

Valuation 消费 ledger/revision 事件写 snapshot；Notification 消费 ledger event 创建 canonical Inbox；两者在同一 transaction 中先占用 consumer receipt 再写副作用，失败一起回滚。`worker-registry.ts` 注册两个真实 consumer；event bindings 提供 oracle event type 对应的真实 producer fixture、Outbox/Inbox 查询与副作用查询，不保存预填 PASS。

- [ ] **Step 3: 验证与提交**

```bash
pnpm --filter @huoqiu/api exec vitest run test/integration/portfolio/valuation-replay.spec.ts test/integration/portfolio/notification-dedup.spec.ts test/architecture/portfolio-worker-composition.spec.ts
git add apps/api/src/portfolio apps/api/src/events/portfolio-notification-event-bindings.ts apps/api/src/workers/worker-registry.ts apps/api/test/integration/portfolio apps/api/test/architecture/portfolio-worker-composition.spec.ts apps/api/package.json
git commit -m "feat(portfolio): add valuation and inbox consumers"
```

API lane 不修改 lockfile；Root 在固定窗口整合依赖。

## Task 7: Web 私有组合列表、详情与账本

**Files:**

- Create: `apps/web/src/app/portfolios/page.tsx`
- Create: `apps/web/src/app/portfolios/[portfolioId]/page.tsx`
- Create: `apps/web/src/components/portfolio/create-portfolio-form.tsx`
- Create: `apps/web/src/components/portfolio/ledger-entry-form.tsx`
- Create: `apps/web/src/components/portfolio/positions-table.tsx`
- Create: `apps/web/src/components/portfolio/ledger-table.tsx`
- Create: `apps/web/tests/component/m1/portfolio.spec.tsx`
- Modify: `apps/web/package.json`

- [ ] **Step 1: 写空态、创建、冲突、陈旧和隐私测试**

无组合显示创建入口；金额用字符串输入并校验精度；余额不足保留表单；version conflict 刷新；页面无公开分享、排行、复制、关注按钮。

- [ ] **Step 2: 实现列表与详情**

列表发现本人组合；详情同时请求 portfolio/positions/ledger，只有 committed version 一致才显示“已同步”；估值陈旧展示 as_of 和警告。

- [ ] **Step 3: 实现录入和冲正**

mutation 带 Idempotency-Key；提交中禁用重复点击；网络重试复用 key；冲正二次确认并解释不会删除历史。

- [ ] **Step 4: 验证与提交**

```bash
pnpm --filter @huoqiu/web exec vitest run tests/component/m1/portfolio.spec.tsx
pnpm --filter @huoqiu/web build
git add apps/web
git commit -m "feat(web): add private portfolio ledger"
```

Web lane 提交依赖声明但不修改 lockfile。

## Task 8: Mobile 私有组合列表、详情与账本

**Files:**

- Create: `apps/mobile/app/(tabs)/portfolio.tsx`
- Create: `apps/mobile/app/portfolio/[portfolioId].tsx`
- Create: `apps/mobile/src/components/portfolio/ledger-entry-sheet.tsx`
- Create: `apps/mobile/src/components/portfolio/positions-list.tsx`
- Create: `apps/mobile/tests/component/m1/portfolio.spec.tsx`
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: 写换号、离线、键盘与隐私测试**

换号清组合 cache；离线不允许假提交；金额键盘仍需服务端校验；截图/分享按钮不存在；Deep Link 跨账号 403 后返回本人的列表。

- [ ] **Step 2: 实现屏幕与 mutation**

使用生成 SDK 与相同 committed version 语义；长列表用 FlashList；录入 sheet 支持 buy/sell/fee，不出现真实下单文案。

- [ ] **Step 3: 验证与提交**

```bash
pnpm --filter @huoqiu/mobile exec vitest run tests/component/m1/portfolio.spec.tsx
pnpm --filter @huoqiu/mobile typecheck
git add apps/mobile
git commit -m "feat(mobile): add private portfolio ledger"
```

Mobile lane 提交依赖声明但不修改 lockfile；Root 统一更新。

## Task 9: 建立通知与组合黄金路径

**Files:**

- Create: `tests/e2e/playwright/m1/portfolio-golden.spec.ts`
- Create: `tests/e2e/playwright/m1/notification-golden.spec.ts`
- Create: `tests/e2e/maestro/m1/portfolio.yaml`
- Create: `tests/e2e/maestro/m1/deep-link-offline.yaml`
- Create: `quality/manifests/caps/CAP-NOTIF-001.json`
- Create: `quality/manifests/caps/CAP-PORT-001.json`
- Create: `quality/manifests/events/portfolio-notification.v1.json`
- Create: `tests/integration/events/portfolio-notification-runtime.spec.ts`

- [ ] **Step 1: 写组合黄金路径**

用户 A 创建 CNY 组合 → buy+fee → cash/position/ledger 同版本 → 超额 sell 拒绝无新增 → 相同 key 重放单条 → 冲正新条目 → Web/iOS/Android 发现同 ID → 用户 B 全部 403。

- [ ] **Step 2: 写通知黄金路径**

A 离线 → B 的批准评论/点赞触发 canonical Inbox → A 重连 Last-Event-ID 恢复无重复 → 点击 Deep Link 鉴权 → hidden 后稳定 unavailable → watermark 单调。

- [ ] **Step 3: 运行 Web 与 Mobile E2E**

```bash
pnpm exec playwright test -c tests/e2e/playwright.config.ts tests/e2e/playwright/m1/portfolio-golden.spec.ts tests/e2e/playwright/m1/notification-golden.spec.ts --project=chromium --project=webkit --project=firefox
pnpm e2e:mobile:m1:ios -- tests/e2e/maestro/m1/portfolio.yaml tests/e2e/maestro/m1/deep-link-offline.yaml
pnpm e2e:mobile:m1:android -- tests/e2e/maestro/m1/portfolio.yaml tests/e2e/maestro/m1/deep-link-offline.yaml
```

- [ ] **Step 4: 运行真实 Portfolio/Notification Event runtime scope**

测试通过 Foundation 的只读 oracle/hash 选择真实 event/producer，不从本计划 manifest 取得期望。它必须执行 Portfolio/Notification commands 及上游 Community/Watchlist fixture → 同事务 Outbox → dispatcher → production worker registry 的 Valuation/Notification consumers，并验证：重复投递无第二 snapshot/Inbox、旧 sequence/revision 不覆盖、强制失败进入 DLQ 后 replay 一次成功、forged producer/unauthorized source 被拒，以及 email/token/正文/设备信息不进入 payload 或 Inbox。

```bash
pnpm --filter @huoqiu/api exec vitest run ../../tests/integration/events/portfolio-notification-runtime.spec.ts
pnpm qa:events:runtime -- --scope portfolio-notification
```

`portfolio-notification.v1.json` 只索引 fixture command、真实 binding 与 DB 可查询证据，不能预填 PASS。它必须把 Market 计划留下的 `watchlist.item_changed` pending consumer 更新为本计划真实 `notification-event.consumer.ts` 证据；scope 结果不等于全局 18/18 PASS，原始证据写入 gitignored `artifacts/evidence/events/`。

- [ ] **Step 5: 运行完整 CAP Gate**

```bash
pnpm qa:cap -- --milestone m1 --cap CAP-NOTIF-001
pnpm qa:cap -- --milestone m1 --cap CAP-PORT-001
```

这是本计划唯一允许运行完整 CAP Gate 的任务；manifest 只能引用刚生成的 Web/iOS/Android/API 原始证据。

- [ ] **Step 6: 提交证据索引**

```bash
git add tests/e2e tests/integration/events/portfolio-notification-runtime.spec.ts quality/manifests/caps quality/manifests/events/portfolio-notification.v1.json
git commit -m "test(e2e): verify M1 inbox and portfolio"
```

## 退出清单

- [ ] canonical Inbox 离线创建、recipient 隔离、watermark 单调、SSE 恢复与断流全通过。
- [ ] 组合账本借贷平衡、追加、幂等、冲正、负余额拒绝、重放确定。
- [ ] cash/position/version 与 entry 在同一事务提交，异步消费者不承担核心正确性。
- [ ] Web/iOS/Android 发现同一组合与自选 ID，跨账号全部拒绝。
- [ ] 界面只描述模拟记录和复盘，不包含下单、排行、复制、跟单或收益承诺。
- [ ] Portfolio/Notification event scope 有真实 producer/outbox/consumer、重复/乱序、DLQ replay 与 PII/source 负测，并补齐 `watchlist.item_changed` consumer；不超报全局 Gate。
