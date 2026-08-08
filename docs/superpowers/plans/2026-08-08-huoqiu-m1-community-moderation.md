# 火球 M1 社区与审核 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在双层员工 Alpha 内交付短帖、评论、点赞、举报、审核、隐藏、恢复、封禁和审计闭环，确保未审核内容不向其他用户可见。

**Architecture:** Content、Social、Moderation、Identity 分别拥有自己的权威表。Moderation decision 在模块化单体的一个 PostgreSQL transaction 中调用权威域受控命令；决定记录和状态变化任一失败时全部回滚。Outbox 事件由实际改变权威状态的领域发布，Feed/Search/Notification 只维护投影。

**Tech Stack:** NestJS、Drizzle/PostgreSQL、Tiptap OSS core（Web 长文编辑不在 M1 Required）、Next.js、Expo、React Admin/Next Admin、Vitest、Playwright、Maestro。

## Global Constraints

- Content/Comment 创建默认 `reviewing`；除作者、Reviewer/Admin 外不可见。
- M1 只做短帖纯文本与关联 listing；媒体上传、私信、申诉、长文发布和公网 UGC 不在 Required。
- Operator 不得审核，Reviewer 不得改变运营排序；所有管理动作带 actor、理由、版本、证据摘要和 trace。
- 举报表只能由 Moderation 写；Social/Content 不直接写审核决定。
- 禁用用户的 auth guard 强一致拒绝新写；异步事件只更新可见性、通知和审计投影。
- Post/Comment 的 `rejected` 是显式、持久且对作者可见的终态；M1 不支持编辑后重提。`reject` 必须调用权威域命令，不能用 `hidden` 冒充。
- 执行依赖固定为 Content 命令 → Moderation 案件/决定骨架 → Social 命令 → Identity suspension + 跨域 coordinator → 客户端 → 最终证据。Coordinator 出现前不得调用不存在的 Social 或 suspension 实现。
- API、Admin、Web、Mobile 泳道只修改各自 `package.json`；Root 在固定集成窗口统一更新 `pnpm-lock.yaml`。所有新模块/consumer 必须在同一任务注册到 `AppModule`/worker composition root 并有注册测试。

---

## Task 1: 实现 Content 状态机与短帖生命周期

**Files:**

- Create: `packages/domain/src/content/post.ts`
- Create: `packages/domain/src/content/post-policy.ts`
- Create: `packages/domain/test/content/post-state-machine.spec.ts`
- Modify: `packages/domain/package.json`
- Create: `apps/api/src/content/content.repository.ts`
- Create: `apps/api/src/content/content.service.ts`
- Create: `apps/api/src/content/content.controller.ts`
- Create: `apps/api/src/content/content.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json`
- Create: `apps/api/test/integration/content/post-lifecycle.spec.ts`
- Create: `apps/api/test/architecture/content-composition.spec.ts`

- [ ] **Step 1: 写状态转移和幂等失败测试**

允许 `draft -> reviewing -> published -> hidden -> published(restored)` 或 `reviewing -> rejected`；`rejected` 不得 publish/hide/restore，`reviewing` 不得直接 hidden/restore；相同 author+client_request_id 只创建一帖；正文限制 1–5000 字符。

- [ ] **Step 2: 运行失败测试**

```bash
pnpm --filter @huoqiu/domain exec vitest run test/content
pnpm --filter @huoqiu/api exec vitest run test/integration/content/post-lifecycle.spec.ts
```

- [ ] **Step 3: 实现 API-POST-001..002**

POST 接收正文、可选 `listing_id`、`client_request_id`，写 post/revision/outbox `content.post_submitted` 同事务；GET 按 actor 和 status 返回，隐藏内容对普通 actor 返回 `CONTENT_UNAVAILABLE`。

- [ ] **Step 4: 实现权威域受控命令**

```ts
publishPost(tx, actor, postId, expectedVersion);
rejectPost(tx, actor, postId, expectedVersion, reasonCode);
hidePost(tx, actor, postId, expectedVersion);
restorePost(tx, actor, postId, expectedVersion);
```

命令更新 Content 表并由 Content 写 approved event 目录中已有的 published/hidden/restored Outbox；reject 只持久化 `rejected` 状态，由稍后的 Moderation coordinator 发布 `moderation.decision_recorded`，不得私自新增第 19 个事件。Moderation 不直接 update Content 表。`AppModule` 必须 import `ContentModule`，架构测试发现孤儿 controller/module 时失败。

- [ ] **Step 5: 验证与提交**

```bash
pnpm --filter @huoqiu/domain exec vitest run test/content/post-state-machine.spec.ts
pnpm --filter @huoqiu/api exec vitest run test/integration/content/post-lifecycle.spec.ts test/architecture/content-composition.spec.ts
git add packages/domain/src/content packages/domain/test/content packages/domain/package.json apps/api/src/content apps/api/src/app.module.ts apps/api/test/integration/content apps/api/test/architecture/content-composition.spec.ts apps/api/package.json
git commit -m "feat(content): add moderated short-post lifecycle"
```

这里只跑 Content 目标测试；完整 `CAP-CONTENT-001` 仅在 Task 8 的 Web/Admin/Mobile 黄金路径齐备后运行。API lane 提交依赖声明，Root 另行更新 lockfile。

## Task 2: 先实现举报、案件与决定策略骨架

**Files:**

- Create: `packages/domain/src/moderation/case.ts`
- Create: `packages/domain/src/moderation/decision.ts`
- Create: `packages/domain/test/moderation/decision.spec.ts`
- Create: `apps/api/src/moderation/moderation.repository.ts`
- Create: `apps/api/src/moderation/moderation.service.ts`
- Create: `apps/api/src/moderation/moderation.controller.ts`
- Create: `apps/api/src/moderation/moderation.module.ts`
- Create: `apps/api/src/moderation/authority-command.ports.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json`
- Create: `apps/api/test/integration/moderation/case-skeleton.spec.ts`
- Create: `apps/api/test/integration/moderation/report-dedup.spec.ts`
- Create: `apps/api/test/architecture/moderation-composition.spec.ts`

- [ ] **Step 1: 写重复举报、证据快照和版本冲突测试**

同 target+reporter+reason 合并；证据保存提交时公开上下文摘要和 hash，不保存无关个人信息；过期 `If-Match` 返回 `CONFLICT`。

- [ ] **Step 2: 写决定策略与缺失 authority port 的 fail-closed 测试**

策略校验 `approve/reject/hide/restore/ban` 与 target 类型、Reviewer 角色、expected version、非空 reason 的组合。此任务只定义 Content/Social/Identity authority command ports；若尚未注入某个实现，决定执行必须 fail closed 且不写 decision draft/audit，不能用空实现或直接跨域 update 绕过。

- [ ] **Step 3: 实现 API-REPORT-001 与 API-MOD-001 骨架**

实现举报创建与案件列表；决定 policy 和 DTO 严格来自共享 contract，但 `API-MOD-002` 的执行 route 要等 Task 5 coordinator 接齐三个 authority port 后才注册。`ModerationModule` 在 `AppModule` 注册后，composition test 必须确认当前 route surface 不会暴露一个调用未实现 Social/suspension 的半成品决定 endpoint。

- [ ] **Step 4: 保存证据快照与 append-only 案件骨架**

同 target+reporter+reason 幂等合并；证据只保存当时公开上下文摘要、hash、actor/trace/version，不保存正文全集或无关 PII。该任务不创建 coordinator、不调用 Social、不调用 `suspendUser`。

- [ ] **Step 5: 验证与提交**

```bash
pnpm --filter @huoqiu/domain exec vitest run test/moderation/decision.spec.ts
pnpm --filter @huoqiu/api exec vitest run test/integration/moderation/case-skeleton.spec.ts test/integration/moderation/report-dedup.spec.ts test/architecture/moderation-composition.spec.ts
git add packages/domain/src/moderation packages/domain/test/moderation apps/api/src/moderation apps/api/src/app.module.ts apps/api/test/integration/moderation apps/api/test/architecture/moderation-composition.spec.ts apps/api/package.json
git commit -m "feat(moderation): add report and case skeleton"
```

API lane 只提交自身依赖声明；Root 在集成窗口更新 lockfile。

## Task 3: 实现最小审核 Admin

**Files:**

- Create: `apps/admin/src/app/moderation/page.tsx`
- Create: `apps/admin/src/app/moderation/[caseId]/page.tsx`
- Create: `apps/admin/src/components/moderation/case-queue.tsx`
- Create: `apps/admin/src/components/moderation/evidence-panel.tsx`
- Create: `apps/admin/src/components/moderation/decision-form.tsx`
- Create: `apps/admin/tests/component/moderation.spec.tsx`
- Modify: `apps/admin/package.json`

- [ ] **Step 1: 写 Operator 拒绝与 Reviewer 冲突测试**

Operator 访问返回 403 页面；Reviewer 可看队列/证据；旧 version 提交显示冲突并强制刷新，不自动覆盖。

- [ ] **Step 2: 实现队列、证据和决定表单**

界面展示 target 类型、作者、状态、举报理由、证据 hash、历史决定、版本；ban/hide 要二次确认，理由最少 10 字。

组件测试使用共享 SDK contract mock；真实决定提交的集成测试依赖 Task 5 注册 `API-MOD-002`，不得为了提前点通 UI 在 Admin 内复制 DTO 或增加临时 endpoint。

- [ ] **Step 3: 处理完整状态矩阵**

loading、empty、error、conflict、already-decided、target-deleted、session-expired 都有明确 UI；没有任意 HTML 渲染。

- [ ] **Step 4: 验证与提交**

```bash
pnpm --filter @huoqiu/admin test
pnpm --filter @huoqiu/admin build
git add apps/admin
git commit -m "feat(admin): add M1 moderation console"
```

Admin lane 只提交 `apps/admin/package.json` 的依赖声明；Root 统一更新 lockfile。

## Task 4: 实现 Social 评论与点赞

**Files:**

- Create: `packages/domain/src/social/comment.ts`
- Create: `packages/domain/src/social/reaction.ts`
- Create: `packages/domain/test/social/reaction.spec.ts`
- Create: `packages/domain/test/social/comment-state-machine.spec.ts`
- Modify: `packages/domain/package.json`
- Create: `apps/api/src/social/social.repository.ts`
- Create: `apps/api/src/social/social.service.ts`
- Create: `apps/api/src/social/social.controller.ts`
- Create: `apps/api/src/social/social.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/package.json`
- Create: `apps/api/test/integration/social/comment-moderation.spec.ts`
- Create: `apps/api/test/integration/social/reaction.spec.ts`
- Create: `apps/api/test/architecture/social-composition.spec.ts`

- [ ] **Step 1: 写评论可见性与点赞幂等测试**

reviewing 评论只对作者和 Reviewer 可见；允许 `reviewing -> published|rejected`，`rejected` 对作者可见但不得发布/隐藏/恢复；批准后他人可见；隐藏/恢复传播；重复 PUT like 计数不增；重复 DELETE 成功；`viewer_reaction` 与 actor 一致。

- [ ] **Step 2: 实现 API-COMMENT-000..001**

创建评论写 Social 表和 `social.comment_submitted`；读取按 post/comment 状态过滤；cursor 稳定；隐藏评论内容不泄露摘要。

- [ ] **Step 3: 实现 API-REACTION-001..002**

唯一键 actor+target+type；mutation 返回 actor 当前状态和投影计数；写 `social.reaction_changed` Outbox，消费者按 event ID 去重。

- [ ] **Step 4: 增加 Social 受控审核命令**

`publishComment/rejectComment/hideComment/restoreComment` 接受同一 transaction 与 expected version，由 Social 发布批准目录已有的权威事件；reject 状态由 `moderation.decision_recorded` 表达，不新增 event type。`AppModule` 必须 import `SocialModule`。

- [ ] **Step 5: 验证与提交**

```bash
pnpm --filter @huoqiu/domain exec vitest run test/social
pnpm --filter @huoqiu/api exec vitest run test/integration/social test/architecture/social-composition.spec.ts
git add packages/domain/src/social packages/domain/test/social packages/domain/package.json apps/api/src/social apps/api/src/app.module.ts apps/api/test/integration/social apps/api/test/architecture/social-composition.spec.ts apps/api/package.json
git commit -m "feat(social): add moderated comments and reactions"
```

这里只跑 Social 目标测试；完整 `CAP-SOCIAL-001` 留到 Task 8。API lane 不修改 lockfile。

## Task 5: 先完成封禁与投影消费者，再接跨域审核 Coordinator

**Files:**

- Create: `apps/api/src/identity/suspension.service.ts`
- Create: `apps/api/src/search/search-projector.ts`
- Create: `apps/api/src/moderation/moderation-coordinator.ts`
- Create: `apps/api/src/events/community-event-bindings.ts`
- Modify: `apps/api/src/moderation/moderation.controller.ts`
- Modify: `apps/api/src/moderation/moderation.service.ts`
- Modify: `apps/api/src/app.module.ts`
- Modify: `apps/api/src/workers/worker-registry.ts`
- Modify: `apps/api/package.json`
- Create: `apps/api/test/integration/moderation/decision-transaction.spec.ts`
- Create: `apps/api/test/integration/moderation/visibility-propagation.spec.ts`
- Create: `apps/api/test/security/moderation-rbac.spec.ts`
- Create: `apps/api/test/security/auth-bypass.spec.ts`
- Create: `apps/api/test/architecture/community-worker-composition.spec.ts`

- [ ] **Step 1: 写封禁强一致和投影最终一致测试**

ban transaction 提交后用户所有新写立即 403、session 撤销、SSE 关闭；随后事件消费者使已发布内容/评论不可见并留下审计。

- [ ] **Step 2: 写 hidden/restored 的 Feed/Search 回归**

hidden 后 Feed/Search 均消失，旧通知落到稳定 unavailable；restored 后按权限恢复；重复事件不产生第二投影。

- [ ] **Step 3: 在三个 authority port 都存在后实现 Coordinator**

先将 Content 的 `publish/reject/hide/restorePost`、Social 的 `publish/reject/hide/restoreComment` 与 Identity 的 `suspendUser` 注入真实实现，再注册 `API-MOD-002`。Coordinator 创建一个 transaction，写 decision draft，调用匹配 target/action 的权威命令，写 finalized decision/audit 与 `moderation.decision_recorded`；故意让任一命令失败时 decision、权威状态、Outbox、audit 全部回滚。禁止 fallback 空实现、直接跨域 SQL 或在 Task 2 预先调用尚不存在的命令。

- [ ] **Step 4: 注册 HTTP 与 Worker composition roots**

`AppModule` 暴露完整 Moderation route；`worker-registry.ts` 注册 Feed/Search/审计消费者，`community-event-bindings.ts` 将 Community 相关 oracle event type 绑定到真实 producer fixture、Outbox 查询和 consumer 可观察副作用。注册测试必须发现孤儿 module、漏 consumer 或 producer 名称不匹配。

- [ ] **Step 5: 实现并验证目标测试**

```bash
pnpm --filter @huoqiu/api exec vitest run test/integration/moderation/decision-transaction.spec.ts test/integration/moderation/visibility-propagation.spec.ts test/security/moderation-rbac.spec.ts test/security/auth-bypass.spec.ts test/architecture/community-worker-composition.spec.ts
```

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/identity apps/api/src/search apps/api/src/moderation apps/api/src/events/community-event-bindings.ts apps/api/src/app.module.ts apps/api/src/workers/worker-registry.ts apps/api/test apps/api/package.json
git commit -m "feat(moderation): enforce suspension and visibility propagation"
```

API lane 只声明依赖；Root 统一更新 lockfile。

## Task 6: Web 短帖发布与详情互动

**Files:**

- Create: `apps/web/src/app/compose/page.tsx`
- Create: `apps/web/src/app/posts/[postId]/page.tsx`
- Create: `apps/web/src/components/content/short-post-composer.tsx`
- Create: `apps/web/src/components/content/post-detail.tsx`
- Create: `apps/web/src/components/social/comment-list.tsx`
- Create: `apps/web/src/components/social/reaction-toggle.tsx`
- Create: `apps/web/src/components/moderation/report-dialog.tsx`
- Create: `apps/web/tests/component/m1/post-states.spec.tsx`
- Modify: `apps/web/package.json`

- [ ] **Step 1: 写本地草稿、reviewing、XSS 与互动状态测试**

发布失败保留草稿；成功显示“审核中”；作者能看 reviewing，其他用户不能；文本 `<script>` 只作为文本；点赞乐观回滚；举报重复显示已提交。

- [ ] **Step 2: 实现短帖 composer**

使用受控 textarea，不启用任意 HTML；支持关联一个可见 listing；每次发布生成稳定 client request ID 和 Idempotency-Key。

- [ ] **Step 3: 实现详情、评论、点赞与举报**

对象 hidden/deleted 显示稳定 unavailable；无权限不展示正文；评论审核状态对作者明确；mutation 失败不丢输入。

- [ ] **Step 4: 验证与提交**

```bash
pnpm --filter @huoqiu/web exec vitest run tests/component/m1/post-states.spec.tsx
pnpm --filter @huoqiu/web build
git add apps/web
git commit -m "feat(web): add moderated community flow"
```

Web lane 提交依赖声明但不修改 lockfile；Root 在集成窗口统一更新。

## Task 7: Mobile 短帖发布与详情互动

**Files:**

- Create: `apps/mobile/app/compose.tsx`
- Create: `apps/mobile/app/post/[postId].tsx`
- Create: `apps/mobile/src/components/content/short-post-composer.tsx`
- Create: `apps/mobile/src/components/social/comment-list.tsx`
- Create: `apps/mobile/src/components/social/reaction-toggle.tsx`
- Create: `apps/mobile/tests/component/m1/community.spec.tsx`
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: 写键盘、草稿、换号和离线重试测试**

草稿按 actor 隔离；退出清除未提交敏感缓存；离线重试复用相同 Idempotency-Key；键盘不遮挡发布按钮。

- [ ] **Step 2: 实现发布和详情屏**

使用生成 SDK；Deep Link `huoqiu://post/:postId` 先恢复会话再鉴权；hidden/deleted 不从本地 cache 泄露正文。

- [ ] **Step 3: 验证与提交**

```bash
pnpm --filter @huoqiu/mobile exec vitest run tests/component/m1/community.spec.tsx
pnpm --filter @huoqiu/mobile typecheck
git add apps/mobile
git commit -m "feat(mobile): add moderated community flow"
```

Mobile lane 提交依赖声明但不修改 lockfile；Root 在集成窗口统一更新。

## Task 8: 建立社区与审核黄金路径

**Files:**

- Create: `tests/e2e/playwright/m1/community-golden.spec.ts`
- Create: `tests/e2e/playwright/m1/moderation-golden.spec.ts`
- Create: `tests/e2e/playwright/m1/negative-paths.spec.ts`
- Create: `tests/e2e/maestro/m1/community.yaml`
- Create: `quality/manifests/caps/CAP-CONTENT-001.json`
- Create: `quality/manifests/caps/CAP-SOCIAL-001.json`
- Create: `quality/manifests/caps/CAP-MOD-001.json`
- Create: `quality/manifests/events/community-moderation.v1.json`
- Create: `tests/integration/events/community-runtime.spec.ts`

- [ ] **Step 1: 写共享核心流**

用户 A 发帖 reviewing → Reviewer 批准 → 用户 B Feed 看见 → B 评论 reviewing → Reviewer 批准 → B 点赞两次仍计一次 → A 举报测试对象 → Reviewer 隐藏/恢复。

- [ ] **Step 2: 写负向流**

外部请求、Operator 审核、过期 If-Match、跨账号草稿、XSS、超长正文、rate limit、被封用户写入均被正确拒绝。

- [ ] **Step 3: 运行三浏览器和两移动平台**

```bash
pnpm exec playwright test -c tests/e2e/playwright.config.ts tests/e2e/playwright/m1/community-golden.spec.ts tests/e2e/playwright/m1/moderation-golden.spec.ts tests/e2e/playwright/m1/negative-paths.spec.ts --project=chromium --project=webkit --project=firefox
pnpm e2e:mobile:m1:ios -- tests/e2e/maestro/m1/community.yaml
pnpm e2e:mobile:m1:android -- tests/e2e/maestro/m1/community.yaml
```

- [ ] **Step 4: 运行真实 Community Event runtime scope**

`community-runtime.spec.ts` 必须通过 Foundation 的只读 event oracle/hash 枚举 Community/Moderation/Identity suspension 类型，并逐个执行真实 command → 同事务 Outbox → dispatcher → 注册 consumer。测试要重复投递、交换同 aggregate sequence、强制失败进入 DLQ 后 replay，并注入 email/token 正文泄漏与伪造 producer/source；断言副作用一次、旧序列不覆盖、DLQ 可恢复、PII/source 均拒绝。

```bash
pnpm --filter @huoqiu/api exec vitest run ../../tests/integration/events/community-runtime.spec.ts
pnpm qa:events:runtime -- --scope community
```

`community-moderation.v1.json` 只枚举 fixture 命令、真实 producer/consumer binding 和可查询副作用，期望 type/producer 来自独立 oracle；不得预填 PASS 或自定义较弱通过条件。Scope Gate 只能报告本 scope 实际覆盖数，不得宣称全局 18/18 已通过；原始证据由 Gate 写入 gitignored `artifacts/evidence/events/`。

- [ ] **Step 5: 运行三个完整 CAP Gate**

```bash
pnpm qa:cap -- --milestone m1 --cap CAP-CONTENT-001
pnpm qa:cap -- --milestone m1 --cap CAP-SOCIAL-001
pnpm qa:cap -- --milestone m1 --cap CAP-MOD-001
```

- [ ] **Step 6: 提交证据索引**

```bash
git add tests/e2e tests/integration/events/community-runtime.spec.ts quality/manifests/caps quality/manifests/events/community-moderation.v1.json
git commit -m "test(e2e): verify M1 community moderation chain"
```

## 退出清单

- [ ] reviewing 内容只对本人和审核角色可见，批准后才进入公开投影。
- [ ] rejected Post/Comment 有独立终态和权威命令，不以 hidden 代替，也不被重新发布。
- [ ] approve/hide/restore/ban 的决定与权威状态同事务，失败整单回滚。
- [ ] 评论和点赞幂等、跨账号隔离、XSS 和限流测试通过。
- [ ] 隐藏、恢复和封禁在 Feed、Search、通知落地与本地 cache 都有稳定行为。
- [ ] M1 环境仍为员工双层封闭；没有申诉/复审时不得声称公网 UGC Ready。
- [ ] Community event scope 有真实 producer/outbox/consumer、重复/乱序、DLQ replay 与 PII/source 负测证据，但不超报全局 18-event Gate。
