# 火球 M1 跨端集成与发布门禁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 10 个 Required CAP 集成为 Web、iOS、Android 与 Admin 的员工封闭 Vertical Alpha，完成视觉品控、跨端 E2E、安全、供应链、恢复和证据 Gate。

**Architecture:** 所有客户端消费同一生成 SDK、Route/Screen/Deep Link registry 和领域 ID；Staging 由边缘 Zero Trust/VPN 与 API alpha claim 双层保护。质量 runner 汇总 contract、DDL、event、unit、integration、Playwright、Maestro、安全、恢复、可访问性和人工复核证据。

**Tech Stack:** Playwright、Maestro、axe-core、Lighthouse CI、k6、Gitleaks、Semgrep、Syft、Trivy、Grype、PostgreSQL restore scripts、OpenTelemetry。

## Global Constraints

- M1 不是公开 Beta、商店版本或可用 MVP；报告标题必须是“Employee Vertical Alpha Ready”。
- iOS 与 Android Required Flow 必须真实运行；M1 不允许用 Expo Web 或 prebuild 代替。
- 独立复核人不得验收自己实现的 CAP；任何 P0/P1、Required skip、未知许可证、Secret、可利用 High/Critical 都阻断 Gate。
- 视觉目标是信息架构、密度、状态与交互完整，不复制雪球商标、Logo、插画、文案或受保护资产。
- Day 6 功能冻结；Day 7 只修阻断缺陷，不增加 Stretch。
- 视觉、可访问性、可靠性、双平台真实 E2E 均为 M1 hard gate；若七天窗口内任一证据未完成或未达阈值，里程碑状态只能是 `NOT_READY`，不得降级、豁免或改写成“有条件通过”。

---

## Task 1: 统一 Route、Screen 与 Deep Link Registry

**Files:**

- Create: `packages/contracts/src/navigation/registry.ts`
- Create: `packages/contracts/test/navigation/registry.spec.ts`
- Create: `apps/web/src/navigation/registry.ts`
- Create: `apps/mobile/src/navigation/registry.ts`
- Create: `scripts/quality/navigation-gate.mts`

- [ ] **Step 1: 写 11 个 PAGE ID 映射和禁用入口失败测试**

Registry 精确包含 AUTH、HOME、SEARCH、INSTRUMENT、WATCHLIST、COMPOSE、POST、NOTIFICATIONS、PORTFOLIO_LIST、PORTFOLIO、MODERATION；Admin 没有 App Deep Link。禁止 private fund、trade、public portfolio、AI advice、push route。

- [ ] **Step 2: 实现单一 Registry**

```ts
export const pageRegistry = {
  "PAGE-AUTH-001": {
    web: "/login",
    app: "/(auth)/sign-in",
    deepLink: "huoqiu://login",
  },
  "PAGE-HOME-001": { web: "/", app: "/(tabs)/home", deepLink: "huoqiu://home" },
  "PAGE-SEARCH-001": {
    web: "/search",
    app: "/search",
    deepLink: "huoqiu://search",
  },
  "PAGE-INST-001": {
    web: "/instruments/:listingId",
    app: "/instrument/:listingId",
    deepLink: "huoqiu://instrument/:listingId",
  },
  "PAGE-WATCH-001": {
    web: "/watchlist",
    app: "/(tabs)/watchlist",
    deepLink: "huoqiu://watchlist",
  },
  "PAGE-COMPOSE-001": {
    web: "/compose",
    app: "/compose",
    deepLink: "huoqiu://compose",
  },
  "PAGE-POST-001": {
    web: "/posts/:postId",
    app: "/post/:postId",
    deepLink: "huoqiu://post/:postId",
  },
  "PAGE-NOTIF-001": {
    web: "/notifications",
    app: "/notifications",
    deepLink: "huoqiu://notifications",
  },
  "PAGE-PORT-LIST-001": {
    web: "/portfolios",
    app: "/(tabs)/portfolio",
    deepLink: "huoqiu://portfolios",
  },
  "PAGE-PORT-001": {
    web: "/portfolios/:portfolioId",
    app: "/portfolio/:portfolioId",
    deepLink: "huoqiu://portfolio/:portfolioId",
  },
  "PAGE-MOD-001": { web: "/admin/moderation", app: null, deepLink: null },
} as const;
```

客户端 registry 从这个完整对象派生，不复制路径字符串。

- [ ] **Step 3: 实现 Deep Link 鉴权规则**

每个业务 Deep Link 先解析 schema、恢复 alpha/session、校验资源权限，再导航；无效/隐藏/跨账号对象进入稳定 unavailable，不回显内部 ID 之外的私有数据。

- [ ] **Step 4: 验证与提交**

```bash
pnpm qa:navigation
git add packages/contracts/src/navigation packages/contracts/test/navigation apps/web/src/navigation apps/mobile/src/navigation scripts/quality package.json pnpm-lock.yaml
git commit -m "feat(navigation): unify cross-platform routes"
```

## Task 2: 完成 M1 全页面状态矩阵

**Files:**

- Create: `quality/manifests/m1-page-states.json`
- Create: `apps/web/tests/component/m1/page-state-matrix.spec.tsx`
- Create: `apps/mobile/tests/component/m1/page-state-matrix.spec.tsx`
- Create: `apps/admin/tests/component/m1/page-state-matrix.spec.tsx`
- Create: `scripts/quality/page-state-gate.mts`

- [ ] **Step 1: Manifest 登记每页适用状态**

标准集合：normal、loading、empty、error、stale、offline、unauthenticated、forbidden、reviewing、deleted、conflict、success；其中 `success` 必须覆盖自选、互动、审核和组合录入。每个 N/A 记录不可适用理由。

- [ ] **Step 2: 写缺状态即失败的组件测试**

测试通过 test adapter 注入每个状态，断言主文案、重试/登录/刷新动作、不可用按钮和数据时点；禁止把 error 渲染成空白页。

- [ ] **Step 3: 补齐 Web/App/Admin 状态组件**

统一使用平台 UI 包和 design tokens；错误 details 不显示 SQL、路径、stack、token、供应商 secret。

- [ ] **Step 4: 验证与提交**

```bash
pnpm qa:page-states
git add quality/manifests/m1-page-states.json apps/web/tests apps/mobile/tests apps/admin/tests scripts/quality
git commit -m "test(ui): enforce M1 page state matrix"
```

## Task 3: 建立视觉与交互品控基线

**Files:**

- Create: `docs/product/visual-parity-checklist.md`
- Create: `tests/e2e/playwright/m1/visual-baseline.spec.ts`
- Create: `tests/e2e/maestro/m1/visual-smoke.yaml`
- Create: `quality/manifests/visual-baselines.json`
- Create: `scripts/quality/visual-gate.mts`

- [ ] **Step 1: 把参考截图拆成结构检查项**

检查 Web 顶栏/左栏/中栏/右栏、频道、Feed 卡、行情表、详情图表；App 顶部搜索/频道横滑/底栏、Feed、行情详情、发布器、消息、组合。每项登记 Fireball 页面、viewport、交互和版权替换说明。

- [ ] **Step 2: 生成火球批准基线**

Web 固定 1440×1000、390×844；App 固定 iPhone 15 与 Pixel 9 模拟器。基线只能在主代理和视觉复核人共同签字后更新。

- [ ] **Step 3: 设置视觉阈值**

关键布局区域像素差阈值 0.5%，动态数字/时间/头像使用 mask；超过阈值必须人工确认，不能通过提高全局阈值关闭失败。

- [ ] **Step 4: 运行交互检查**

频道横滑、搜索输入、Feed 滚动、图表周期、自选切换、发布键盘、通知 Deep Link、组合 sheet、Admin decision 都不得有死按钮或遮挡。

- [ ] **Step 5: 验证与提交**

```bash
pnpm qa:visual
git add docs/product tests/e2e quality/manifests/visual-baselines.json scripts/quality
git commit -m "test(visual): add fireball parity baselines"
```

## Task 4: 建立可访问性与输入法 Gate

**Files:**

- Create: `tests/e2e/playwright/m1/accessibility.spec.ts`
- Create: `tests/e2e/maestro/m1/accessibility.yaml`
- Create: `scripts/quality/accessibility-gate.mts`
- Create: `quality/manifests/accessibility.json`
- Create: `quality/checklists/app-screen-reader.md`
- Create: `artifacts/evidence/$BUILD_SHA/accessibility/voiceover-review.json`（由复核脚本生成）
- Create: `artifacts/evidence/$BUILD_SHA/accessibility/talkback-review.json`（由复核脚本生成）

- [ ] **Step 1: 写 Web axe 与键盘路径**

所有 M1 Web/Admin 页面 axe serious/critical 为零；跳转顺序可预测；焦点可见；弹窗锁焦并归还；图表有文本摘要；颜色不是唯一信号。

- [ ] **Step 2: 写 App 自动语义/动态字体检查**

关键控件有 accessibilityLabel/role/state；动态字体 200% 不截断核心动作；触控目标至少 44×44；中文、英文代码、数字读序合理。

- [ ] **Step 3: 执行 VoiceOver 与 TalkBack 人工验证**

非实现者分别在 iPhone 15 模拟器/可用真机开启 VoiceOver、在 Pixel 9 Emulator/可用真机开启 TalkBack，完整执行登录、搜索、行情详情、自选、发帖、评论、通知 Deep Link、组合录入和 Admin 以外的所有 App Required Flow。逐项记录焦点顺序、控件名称/角色/状态、图表文本摘要、错误播报、动态内容播报、键盘可达性和退出路径；每份记录必须包含当前 `commit_sha/contract_sha`、平台/系统版本、设备、录屏路径及 SHA-256、reviewer ID、implementer IDs、P0/P1/P2，并拒绝自审。

```bash
BUILD_SHA=$(git rev-parse HEAD)
pnpm exec tsx scripts/quality/record-review.mts --milestone m1 --dimension voiceover --commit-sha "$BUILD_SHA"
pnpm exec tsx scripts/quality/record-review.mts --milestone m1 --dimension talkback --commit-sha "$BUILD_SHA"
```

缺任一平台人工记录、记录 SHA 不是当前构建、录屏缺失或存在关键读屏障碍时，Accessibility Gate 必须失败；Maestro 的 label 断言不能替代人工读屏。

- [ ] **Step 4: 写中文输入法路径**

搜索、短帖、评论、金额输入分别验证拼音 composition 不被提前提交；键盘出现时发布/保存按钮可达。

- [ ] **Step 5: 运行 Gate**

```bash
pnpm qa:accessibility
```

成功输出：

```text
ACCESSIBILITY_GATE PASS serious=0 critical=0 keyboard_failures=0 touch_target_failures=0 voiceover_review=current talkback_review=current
```

- [ ] **Step 6: 提交**

```bash
git add tests/e2e scripts/quality quality/manifests/accessibility.json quality/checklists/app-screen-reader.md
git commit -m "test(a11y): gate M1 accessibility"
```

## Task 5: 完成共享核心链全端 E2E

**Files:**

- Create: `tests/e2e/playwright/m1/full-golden.spec.ts`
- Create: `tests/e2e/maestro/m1/full-golden.yaml`
- Create: `tests/e2e/fixtures/load-m1-fixture.ts`
- Create: `scripts/quality/e2e-gate.mts`
- Create: `scripts/quality/mobile-m1-evidence.mts`
- Create: `quality/manifests/e2e-m1.json`
- Modify: `package.json`

- [ ] **Step 1: 写 Web 完整链**

无 alpha_access 拒绝 → A 一次性邀请注册/登录 → 搜索/详情/source/as_of → 加自选 → 发帖 reviewing → Reviewer Admin 批准 → B 看到并评论/点赞 → A 离线 Inbox → A SSE 恢复 → Deep Link 原帖 → 隐藏/恢复 → A 创建/录入/冲正私有组合。

- [ ] **Step 2: 写 iOS/Android 同账号一致链**

在每个平台验证相同 user/listing/post/comment/portfolio ID、自选、帖子、评论、Inbox 和组合；换号后私有 cache 清空；离线重试不重复 mutation。

- [ ] **Step 3: 三浏览器连续三次**

```bash
pnpm exec playwright test -c tests/e2e/playwright.config.ts tests/e2e/playwright/m1/full-golden.spec.ts --project=chromium --project=webkit --project=firefox --repeat-each=3
```

预期 9 次全部通过、零跳过。

- [ ] **Step 4: 两移动平台执行**

```bash
pnpm e2e:mobile:m1:ios -- tests/e2e/maestro/m1/full-golden.yaml
pnpm e2e:mobile:m1:android -- tests/e2e/maestro/m1/full-golden.yaml
```

`mobile-m1-evidence.mts` 必须启动指定平台的真实原生 Release/近 Release build、转发 `--` 后的 Flow 路径，并把 simulator/emulator ID、原生 binary SHA-256、`commit_sha/contract_sha`、完整 Maestro 命令、通过/失败/跳过数和录像路径写入原始报告；Expo Web、prebuild 或另一平台的报告不得满足本平台证据。

- [ ] **Step 5: 注册并运行绑定当前 SHA 的统一 E2E Gate**

根命令保持：

```json
{
  "qa:e2e:m1": "tsx scripts/quality/e2e-gate.mts --milestone m1",
  "e2e:mobile:m1:ios": "tsx scripts/quality/mobile-m1-evidence.mts --platform ios",
  "e2e:mobile:m1:android": "tsx scripts/quality/mobile-m1-evidence.mts --platform android"
}
```

`e2e-gate.mts` 自己执行三浏览器 `--repeat-each=3` 以及 iOS/Android full-golden，不只读取旧报告；写证据前重新计算当前 HEAD、contract、Fixture 和原生 binary SHA。任一原始报告不是当前 `git rev-parse HEAD`、任一平台缺失或有 skip 时失败。

```bash
pnpm qa:e2e:m1
```

成功输出：

```text
E2E_GATE PASS commit_sha=current web_runs=9 ios_runs=1 android_runs=1 failed=0 skipped=0
```

- [ ] **Step 6: 提交**

```bash
git add tests/e2e scripts/quality quality/manifests/e2e-m1.json package.json
git commit -m "test(e2e): cover M1 full golden chain"
```

## Task 6: 建立应用安全 Gate

**Files:**

- Create: `apps/api/test/security/idor.spec.ts`
- Create: `apps/api/test/security/xss.spec.ts`
- Create: `apps/api/test/security/csrf.spec.ts`
- Create: `apps/api/test/security/limits.spec.ts`
- Create: `apps/api/test/security/error-redaction.spec.ts`
- Create: `apps/api/test/security/forbidden-surfaces.spec.ts`
- Create: `security/semgrep.yml`
- Create: `scripts/quality/security-gate.mts`
- Modify: `package.json`

- [ ] **Step 1: 写认证绕过和水平越权矩阵**

从 OpenAPI 的 `x-action`、actor/ownership 与 Alpha 准入元数据为 31 个 operation 逐一生成正反期望，不允许统一假设“无 session 必须拒绝”：

- 所有 operation 在无有效 edge proof 或无 `alpha_access` 时都必须在 controller 前拒绝。
- `Public`/`Guest` 读取（搜索、listing、quote/bar、Feed、已发布帖子/评论）通过 Alpha 准入后无业务 session 应成功；注册/登录按 Invited Guest/Guest 语义验证。
- `User`/`Owner`/`Reviewer` operation 无 session 必须 `AUTH_REQUIRED`，错误角色必须 `FORBIDDEN`；只有带 owner 资源的 operation 执行错误 owner 用例。
- suspended actor 对所有受保护写入和私有读取强一致拒绝；读取他人 Inbox、组合、自选和 reviewing 内容均拒绝。

矩阵每行同时包含一个合法请求，防止缺失 route 以 404 冒充安全拒绝；测试断言 31 个 API ID 各有明确 expected status/code，不能用 N/A 静默跳过。

- [ ] **Step 2: 写 XSS、CSRF、大小和限流测试**

覆盖存储/反射 XSS、Cookie mutation CSRF、JSON body 1 MiB、帖/评论长度、登录/发布/举报限流；错误结构无 stack/SQL/path/token。

- [ ] **Step 3: 实现 Semgrep 规则和 Gate**

规则检查直接 SQL 拼接、日志 token、危险 innerHTML、未验证 Deep Link、非 SDK `/v1` fetch、金额 number、禁用 route。

- [ ] **Step 4: 运行 Gate**

```bash
pnpm qa:security
```

成功输出：

```text
SECURITY_GATE PASS auth_bypass=0 idor=0 xss=0 csrf=0 limit_bypass=0 leaked_details=0 forbidden_surface=0
```

- [ ] **Step 5: 提交**

```bash
git add apps/api/test/security security/semgrep.yml scripts/quality package.json pnpm-lock.yaml
git commit -m "test(security): gate M1 application controls"
```

## Task 7: 建立供应链与资产许可证 Gate

**Files:**

- Create: `security/license-allowlist.yml`
- Create: `security/vulnerability-exceptions.yml`
- Modify: `security/artifact-inventory.yml`
- Create: `infra/docker/api.Dockerfile`
- Create: `infra/docker/web.Dockerfile`
- Create: `infra/docker/admin.Dockerfile`
- Create: `scripts/release/build-mobile-artifacts.mts`
- Create: `scripts/quality/supply-chain-gate.mts`
- Create: `quality/manifests/supply-chain.json`

- [ ] **Step 1: 盘点并构建全部发布制品**

每项登记包/字体/图标/插画/模型/Fixture 数据的版本、许可证、来源、分发方式、owner；未知或 AGPL/GPL/商业企业版默认拒绝。`build-mobile-artifacts.mts` 从当前 HEAD 分别构建 iOS Release simulator `.app` 归档和 Android Release `.apk`，输出 binary SHA-256、原生依赖锁文件 SHA 与构建命令到同目录 manifest；Expo export/prebuild 不能代替这两个原生制品。

```bash
BUILD_SHA=$(git rev-parse HEAD)
pnpm release:mobile:artifacts -- --build-sha "$BUILD_SHA" --ios-device "iPhone 15" --android-device "Pixel_9_API_36"
```

固定输出为 `artifacts/build/$BUILD_SHA/mobile/huoqiu-ios-simulator.tar.zst`、`huoqiu-android-release.apk` 和 `manifest.json`；manifest 的 `commit_sha` 不等于当前 HEAD 时后续扫描立即失败。

- [ ] **Step 2: 运行原始扫描**

```bash
BUILD_SHA=$(git rev-parse HEAD)
mkdir -p "artifacts/evidence/$BUILD_SHA/security" "artifacts/evidence/$BUILD_SHA/sbom"
docker build -f infra/docker/api.Dockerfile -t huoqiu-api:$BUILD_SHA .
docker build -f infra/docker/web.Dockerfile -t huoqiu-web:$BUILD_SHA .
docker build -f infra/docker/admin.Dockerfile -t huoqiu-admin:$BUILD_SHA .
gitleaks detect --source . --redact --report-format sarif --report-path artifacts/evidence/$BUILD_SHA/security/gitleaks.sarif --exit-code 1
semgrep scan --config security/semgrep.yml --error --json --output artifacts/evidence/$BUILD_SHA/security/semgrep.json .
syft dir:. -o cyclonedx-json=artifacts/evidence/$BUILD_SHA/sbom/source.cdx.json
syft huoqiu-api:$BUILD_SHA -o cyclonedx-json=artifacts/evidence/$BUILD_SHA/sbom/api-image.cdx.json
syft huoqiu-web:$BUILD_SHA -o cyclonedx-json=artifacts/evidence/$BUILD_SHA/sbom/web-image.cdx.json
syft huoqiu-admin:$BUILD_SHA -o cyclonedx-json=artifacts/evidence/$BUILD_SHA/sbom/admin-image.cdx.json
syft file:artifacts/build/$BUILD_SHA/mobile/huoqiu-ios-simulator.tar.zst -o cyclonedx-json=artifacts/evidence/$BUILD_SHA/sbom/ios.cdx.json
syft file:artifacts/build/$BUILD_SHA/mobile/huoqiu-android-release.apk -o cyclonedx-json=artifacts/evidence/$BUILD_SHA/sbom/android.cdx.json
trivy image --exit-code 0 --severity HIGH,CRITICAL --format json --output artifacts/evidence/$BUILD_SHA/security/trivy-api.json huoqiu-api:$BUILD_SHA
trivy image --exit-code 0 --severity HIGH,CRITICAL --format json --output artifacts/evidence/$BUILD_SHA/security/trivy-web.json huoqiu-web:$BUILD_SHA
trivy image --exit-code 0 --severity HIGH,CRITICAL --format json --output artifacts/evidence/$BUILD_SHA/security/trivy-admin.json huoqiu-admin:$BUILD_SHA
grype sbom:artifacts/evidence/$BUILD_SHA/sbom/source.cdx.json -o json --file artifacts/evidence/$BUILD_SHA/security/grype-source.json
grype sbom:artifacts/evidence/$BUILD_SHA/sbom/api-image.cdx.json -o json --file artifacts/evidence/$BUILD_SHA/security/grype-api.json
grype sbom:artifacts/evidence/$BUILD_SHA/sbom/web-image.cdx.json -o json --file artifacts/evidence/$BUILD_SHA/security/grype-web.json
grype sbom:artifacts/evidence/$BUILD_SHA/sbom/admin-image.cdx.json -o json --file artifacts/evidence/$BUILD_SHA/security/grype-admin.json
grype sbom:artifacts/evidence/$BUILD_SHA/sbom/ios.cdx.json -o json --file artifacts/evidence/$BUILD_SHA/security/grype-ios.json
grype sbom:artifacts/evidence/$BUILD_SHA/sbom/android.cdx.json -o json --file artifacts/evidence/$BUILD_SHA/security/grype-android.json
```

Gate 逐个验证 6 份 SBOM、9 份漏洞原始报告、Gitleaks/Semgrep 两份安全报告和移动 manifest 均存在、非空、SHA-256 已登记且绑定当前 HEAD；源码 SBOM 不能替代容器或移动制品 SBOM。

- [ ] **Step 3: 实现误报签字约束**

`security/vulnerability-exceptions.yml` 的误报记录必须包含 scanner、finding ID、受影响制品 digest、负责人、不可利用证据、影响、补偿控制、到期日、独立安全 reviewer ID 与签字 artifact SHA；缺一项、过期、自审或制品 digest 变化即 Gate 失败。原始 finding 不得从报告删除；High/Critical 只有证明不可利用且独立安全复核签字时才能归入 `signed_false_positive`，否则计入 `exploitable` 并阻断。

- [ ] **Step 4: 运行 Gate**

```bash
pnpm qa:supply-chain
```

成功输出：

```text
SUPPLY_CHAIN_GATE PASS secrets=0 unknown_licenses=0 findings_high=<n> findings_critical=<n> exploitable_high=0 exploitable_critical=0 signed_false_positives=<n> untracked_assets=0 sboms=6 raw_reports=11
```

- [ ] **Step 5: 提交**

```bash
git add security scripts/release scripts/quality quality/manifests/supply-chain.json
git commit -m "test(supply-chain): gate dependencies and assets"
```

## Task 8: 实现 Tombstone、删除传播与写入急停

**Files:**

- Create: `packages/db/src/schema/deletion.ts`
- Create: `packages/db/drizzle/0002_deletion_orchestration.sql`
- Create: `apps/api/src/privacy/deletion-tombstone.repository.ts`
- Create: `apps/api/src/privacy/deletion-orchestrator.service.ts`
- Create: `apps/api/src/privacy/deletion-targets.ts`
- Create: `apps/api/src/platform/write-kill-switch.guard.ts`
- Create: `apps/api/src/platform/write-kill-switch.service.ts`
- Create: `apps/web/src/privacy/tombstone-cache-reset.ts`
- Create: `apps/mobile/src/privacy/tombstone-cache-reset.ts`
- Create: `apps/api/test/integration/privacy/deletion-orchestration.spec.ts`
- Create: `apps/api/test/integration/privacy/deletion-replay-after-restore.spec.ts`
- Create: `apps/api/test/integration/platform/write-kill-switch.spec.ts`
- Create: `apps/web/tests/component/m1/tombstone-cache-reset.spec.tsx`
- Create: `apps/mobile/tests/component/m1/tombstone-cache-reset.spec.tsx`
- Modify: `scripts/quality/ddl-gate.mts`

- [ ] **Step 1: 先写真实删除传播和急停失败测试**

测试创建带帖子、评论、自选、通知和私有组合的合成用户，提交删除请求后断言：先持久化 tombstone；会话立即撤销；Identity/Profile 活动数据清除或不可逆匿名化；Content/Social 权威对象下架；Feed/Search/Notification/Valkey 投影删除；Web/Mobile 换号或重连时清除本地 cache；每个目标写唯一 receipt。备份恢复后重放同一 tombstone，任何公开投影和私有 cache 都不得复活。

急停测试逐一调用 `API-POST-001`、`API-COMMENT-001`、`API-PORT-001/003/004`：开关关闭前合法，服务端开关关闭后 60 秒内统一返回维护状态且无 DB/Outbox 副作用，恢复开关后重新允许；只隐藏客户端按钮不能满足测试。

- [ ] **Step 2: 实现持久 Tombstone、Job 与 Receipt Schema**

`deletion_tombstones` 以 `subject_type+subject_id` 唯一，记录 requested/effective time、policy version 和不可变 sequence；`deletion_jobs` 记录目标系统与重试状态；`deletion_receipts` 以 `tombstone_id+target` 唯一并保存完成时点与结果 hash。迁移和 DDL Gate 必须证明三表存在、重复重放不会产生第二 receipt。M1 使用内部 durable job，不增加或伪造批准目录之外的第 19 个领域事件。

- [ ] **Step 3: 实现可重放删除编排和客户端 cache 清除**

`deletion-orchestrator.service.ts` 先写 tombstone，再按 Identity/Auth、Content/Social、Feed/Search、Notification、Watchlist、Portfolio visibility、Valkey cache 的显式 target registry 执行幂等清理并写 receipt；失败目标保留 job 重试且对象继续 fail closed。组合账本按批准保留策略去身份化并立即撤销 owner 可达性，不允许为“完成删除”物理改写追加账本。Web/Mobile 在 session subject/version 或 tombstone watermark 变化时清除所有 actor-scoped Query/persistent cache。

- [ ] **Step 4: 实现 server-side 写入急停**

`write-kill-switch.guard.ts` 在业务 controller 前读取具有版本和更新时间的 server-side flag，对 `content_write`、`comment_write`、`portfolio_write` 默认 fail closed；进程内缓存最长 5 秒并由 Valkey invalidation 加速。读接口保留但返回维护状态字段，Admin/runbook 只调用受审计的 service，不允许客户端或请求 header 绕过。

- [ ] **Step 5: 验证真实实现**

```bash
pnpm --filter @huoqiu/api exec vitest run test/integration/privacy test/integration/platform/write-kill-switch.spec.ts
pnpm --filter @huoqiu/web exec vitest run tests/component/m1/tombstone-cache-reset.spec.tsx
pnpm --filter @huoqiu/mobile exec vitest run tests/component/m1/tombstone-cache-reset.spec.tsx
pnpm qa:ddl
```

预期删除目标全部有 receipt、恢复重放后 resurrection=0、急停生效 ≤60 秒且 blocked mutation side effects=0。

- [ ] **Step 6: 提交**

```bash
git add packages/db apps/api/src/privacy apps/api/src/platform apps/api/test/integration/privacy apps/api/test/integration/platform apps/web/src/privacy apps/web/tests/component/m1 apps/mobile/src/privacy apps/mobile/tests/component/m1 scripts/quality/ddl-gate.mts
git commit -m "feat(safety): implement deletion orchestration and write kill switches"
```

## Task 9: 建立恢复、删除传播与急停演练

**Files:**

- Create: `quality/fixtures/recovery-m1.v1.json`
- Create: `scripts/recovery/backup-test-db.mts`
- Create: `scripts/recovery/restore-isolated-db.mts`
- Create: `scripts/recovery/verify-restored-state.mts`
- Create: `tests/recovery/tombstone-replay.spec.ts`
- Create: `tests/recovery/content-takedown.spec.ts`
- Create: `tests/recovery/feature-flag-kill.spec.ts`
- Create: `scripts/quality/recovery-gate.mts`

- [ ] **Step 1: 生成固定恢复数据集**

100 用户、1,000 listings、10,000 帖子/评论、10,000 notifications、50 组合与 10,000 ledger entries；全为合成数据且有固定 seed。

- [ ] **Step 2: 实现隔离恢复保护**

Restore 目标数据库名必须以 `huoqiu_restore_test_` 开头且 host 不得匹配 production allowlist；否则脚本在执行 drop/create 前退出。

- [ ] **Step 3: 验证迁移、行数、账本 hash 与 tombstone**

恢复后跑所有 migration，校验关键表行数、ledger replay hash，并调用 Task 8 的真实 `deletion-orchestrator.service.ts` 重放 tombstone，验证 Feed/Search/Notification/Valkey/Web/Mobile cache 删除不复活、receipt 齐全和全黄金路径；Recovery Gate 不得用测试内临时删除函数代替运行实现。

- [ ] **Step 4: 演练内容下架和功能开关**

内容下架传播目标 ≤30 秒；演练必须通过 Task 8 的 `write-kill-switch.service.ts` 在 ≤60 秒内关闭发布/评论/组合写入，读侧显示维护状态；记录开始/结束时点、OTel trace、所有被拒 API ID 和副作用为零的 DB hash。

- [ ] **Step 5: 运行 Gate**

```bash
pnpm qa:recovery
```

成功输出：

```text
RECOVERY_GATE PASS restore_minutes<=10 row_mismatch=0 ledger_mismatch=0 tombstone_resurrection=0 takedown_seconds<=30 flagoff_seconds<=60
```

- [ ] **Step 6: 提交**

```bash
git add quality/fixtures scripts/recovery scripts/quality/recovery-gate.mts tests/recovery
git commit -m "test(recovery): verify M1 restore and kill switches"
```

## Task 10: 建立性能、稳定性与可观测验收

**Files:**

- Create: `tests/performance/api-smoke.js`
- Create: `tests/performance/sse-reconnect.js`
- Create: `lighthouserc.json`
- Create: `scripts/quality/reliability-gate.mts`
- Create: `quality/manifests/reliability.json`

- [ ] **Step 1: 固定内部 Alpha 预算**

50 并发 synthetic 用户下读 API p95 ≤500ms、mutation p95 ≤800ms、错误率 <1%；SSE 100 连接重连无丢失/重复；Web 关键页 Lighthouse performance ≥85、accessibility ≥95。

- [ ] **Step 2: 运行 k6 与 Lighthouse**

```bash
k6 run tests/performance/api-smoke.js
k6 run tests/performance/sse-reconnect.js
pnpm exec lhci autorun
```

- [ ] **Step 3: 验证 OTel**

登录、发帖审核、通知、组合录入四条 trace 必须跨 HTTP、DB、Outbox、consumer；日志含 trace ID，不含 token/正文/证据。

- [ ] **Step 4: 运行并提交 Gate**

```bash
pnpm qa:reliability
git add tests/performance lighthouserc.json scripts/quality quality/manifests/reliability.json
git commit -m "test(reliability): gate M1 performance and traces"
```

Reliability Gate 必须读取当前 SHA 的 k6、Lighthouse 和 OTel 原始报告；任一预算未达、报告陈旧或七天内无法完成时输出 `M1_NOT_READY gate=reliability` 并阻断里程碑，不允许降低阈值或以“后续观察”豁免。

## Task 11: 配置双层封闭 Staging

**Files:**

- Create: `infra/staging/compose.yaml`
- Create: `infra/staging/zero-trust-check.md`
- Create: `infra/staging/runbook.md`
- Create: `scripts/quality/staging-access-gate.mts`
- Create: `quality/manifests/staging-access.json`

- [ ] **Step 1: 配置边缘层和 API 层证据**

边缘只允许公司身份/VPN；API 仍校验签名 proof 与 alpha_access。直接访问源站、伪造 header、无 claim、公开注册都拒绝。

- [ ] **Step 2: 配置最小 Secret 与备份**

Secret 由环境 secret store 注入；不进镜像/仓库；PostgreSQL 每日备份，M1 运维目标 RPO≤24h、RTO≤60m。

- [ ] **Step 3: 配置急停与负责人**

发布、评论、组合写入分别有 server-side feature flag；runbook 写具名角色而非个人隐私，包含开关、回滚、恢复和证据位置。

- [ ] **Step 4: 运行 Gate 与提交**

```bash
pnpm qa:staging-access
git add infra/staging scripts/quality/staging-access-gate.mts quality/manifests/staging-access.json
git commit -m "chore(staging): enforce employee-only alpha"
```

## Task 12: 汇总 10 个 CAP 与 M1 Gate

**Files:**

- Modify: `quality/manifests/m1-required.json`
- Create: `artifacts/evidence/$BUILD_SHA/manifest.json`（由脚本生成，不手改）
- Modify: `scripts/quality/assemble-evidence.mts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: 用只读 oracle 锁定 Manifest 并先提交所有 Gate 输入**

`quality/manifests/m1-required.json` 必须与 `quality/oracles/m1-required.json` 精确集合相等、非空、无重复、无额外项；每项包含 `implementer_ids`，不得预填 reviewer。先提交所有 Gate 输入，再从干净 HEAD 生成证据：

```bash
pnpm exec tsx scripts/quality/run-gate.mts --milestone m1 --check-scope-only
git add quality/manifests/m1-required.json scripts/quality/assemble-evidence.mts package.json pnpm-lock.yaml
git commit -m "chore(release): prepare M1 certification inputs"
test -z "$(git status --porcelain)"
```

提交后任何代码、契约、Fixture、配置或 manifest 变化都会让后续证据失效，必须重新执行本 Task。

- [ ] **Step 2: 从当前 HEAD 运行 10 个 CAP Gate**

```bash
pnpm qa:cap -- --milestone m1 --cap CAP-ID-001
pnpm qa:cap -- --milestone m1 --cap CAP-INST-001
pnpm qa:cap -- --milestone m1 --cap CAP-MD-001
pnpm qa:cap -- --milestone m1 --cap CAP-FEED-001
pnpm qa:cap -- --milestone m1 --cap CAP-WATCH-001
pnpm qa:cap -- --milestone m1 --cap CAP-CONTENT-001
pnpm qa:cap -- --milestone m1 --cap CAP-SOCIAL-001
pnpm qa:cap -- --milestone m1 --cap CAP-NOTIF-001
pnpm qa:cap -- --milestone m1 --cap CAP-MOD-001
pnpm qa:cap -- --milestone m1 --cap CAP-PORT-001
```

每行必须 `failed=0 skipped=0`。

- [ ] **Step 3: 从同一干净 HEAD 运行全套 hard gates**

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm qa:contracts
pnpm qa:ddl
pnpm qa:events
pnpm qa:fixtures
pnpm qa:navigation
pnpm qa:page-states
pnpm qa:e2e:m1
pnpm qa:visual
pnpm qa:accessibility
pnpm qa:security
pnpm qa:supply-chain
pnpm qa:recovery
pnpm qa:reliability
pnpm qa:staging-access
```

`qa:e2e:m1` 必须在本步骤重新执行 Web 三浏览器三次以及真实 iOS/Android Flow；不得复用代码冻结前的报告。视觉、可访问性、可靠性或任一双平台 E2E Gate 在七天窗口内未达标时，立即记录 `M1_NOT_READY`，不得删除命令、改为 soft warning 或降低阈值。

- [ ] **Step 4: 独立品控 triage 并签署当前 SHA**

品控负责人核对原始日志、截图、trace、模拟器录像、VoiceOver/TalkBack 人工记录、SBOM、恢复 hash、Zero Trust 证据与 CAP 追踪；范围内 P0/P1 必须为零。复核脚本拒绝 reviewer 出现在任一 `implementer_ids` 中，并要求所有输入 SHA 等于当前 HEAD/contract/Fixture/config：

```bash
BUILD_SHA=$(git rev-parse HEAD)
pnpm exec tsx scripts/quality/record-review.mts --milestone m1 --dimension release --commit-sha "$BUILD_SHA"
```

发现 P0/P1 或任一 hard gate 缺证据时写失败复核并停止；修复产生新 HEAD 后必须重跑 Step 1–4。

- [ ] **Step 5: 最后运行消费当前复核签字的 Gate**

```bash
pnpm gate:m1
```

成功输出必须为：

```text
M1_GATE PASS required_caps=10 api_operations=31 event_types=18 failed=0 skipped=0 p0=0 p1=0
```

Gate 后不得再产生代码、配置或证据索引 commit；`artifacts/evidence/$BUILD_SHA/manifest.json`、原始报告和复核记录由 CI 上传为不可变 artifact，Gate 输出 artifact URI 与 manifest SHA-256。任何后续 commit 都会使 `commit_sha=current` 失效并要求完整重跑。

## M1 退出清单

- [ ] Web、iOS、Android 用同一 API/DB/ID 完成共享核心链和私有组合链。
- [ ] Admin 审核先于 UGC 验收，决定、可见性和封禁证据完整。
- [ ] 31 operation、18 event、所有 migration 与生成 SDK 无漂移。
- [ ] Required 测试零失败零跳过；关键 E2E 重复三次无偶发失败。
- [ ] 安全、供应链、可访问性、视觉、恢复、可靠性、双层准入 Gate 全通过。
- [ ] 10 个 Required CAP 范围内 P0/P1 为零。
- [ ] 报告明确声明员工封闭、Synthetic 数据、无真实交易、无公网 UGC、无商店发布。
