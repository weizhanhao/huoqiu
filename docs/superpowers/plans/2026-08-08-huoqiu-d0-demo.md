# 火球 48 小时 Fixture Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可点击的 Web 黄金路径和可启动的 Expo 四页导航壳，使用同一份版本化 Fixture 演示首页 Feed、标的搜索、合成行情详情与加减自选。

**Architecture:** D0 不启动业务 API、数据库或外部行情。Web 与 Mobile 通过 `@huoqiu/contracts/d0` 读取只读 Fixture；自选状态只存客户端 Fixture store，并明确标记“仅本机演示”。页面共享契约和设计 token，不共享平台组件。

**Tech Stack:** Next.js 16、Expo 57、React 19、React Native 0.86、Zod 4、Zustand 5、ECharts 6、@wuba/react-native-echarts 3.1、Vitest 4、Testing Library、Playwright 1.62、Maestro。

## Global Constraints

- 本计划从 Wave 0 bootstrap SHA 开始；Task 1 由主代理发布 D0 contract SHA，之后 Web/Mobile 才并行。修改范围仅为 `packages/contracts`（仅 Task 1）、`apps/web`、`apps/mobile`、各自 UI 包、D0 E2E 与 D0 manifest。
- Fixture 必须明确标识 `mode: "fixture"`、`source: "huoqiu-synthetic"`、`as_of`；不得发送 `/v1` 业务写请求。
- D0 只有 5 个 Required CAP；内容发布、评论、通知、审核和组合均不进入可点击入口。
- 每个 Required 页面都要有正常、加载、空和错误状态。
- Web 黄金路径是硬 Gate；Mobile 只有在本机工具链可用时才能宣称 iOS/Android 启动通过。

---

## Task 1: 锁定 D0 Fixture contract

**Files:**

- Create: `packages/contracts/src/d0/schema.ts`
- Create: `packages/contracts/src/d0/index.ts`
- Create: `packages/contracts/src/feed/card-v1.ts`
- Create: `packages/contracts/fixtures/d0.v1.json`
- Create: `packages/contracts/test/d0-fixture.contract.spec.ts`
- Create: `packages/contracts/test/synthetic-market-fixture.spec.ts`
- Create: `packages/contracts/test/feed-card-v1.spec.ts`

- [ ] **Step 1: 先写 Fixture 版本、来源和稳定 ID 的失败测试**

```ts
import fixture from '../fixtures/d0.v1.json';
import { d0FixtureSchema } from '../src/d0/schema';

it('parses a versioned, synthetic-only fixture', () => {
  const parsed = d0FixtureSchema.parse(fixture);
  expect(parsed.version).toBe('d0.v1');
  expect(parsed.mode).toBe('fixture');
  expect(parsed.market.source).toBe('huoqiu-synthetic');
  expect(parsed.instruments[0]?.listing_id).toBe('listing_syn_0001');
  expect(parsed.quotes[0]).toMatchObject({
    source: 'huoqiu-synthetic', stale: false, entitlement: 'synthetic',
  });
  expect(parsed.feed[0]?.permissions.alpha_access).toBe(true);
});
```

- [ ] **Step 2: 运行测试，确认因 Schema 不存在而失败**

```bash
pnpm exec vitest run packages/contracts/test/d0-fixture.contract.spec.ts
```

预期：退出码非零，并包含 `Cannot find module '../src/d0/schema'`。

- [ ] **Step 3: 定义精确 Schema**

```ts
import { z } from 'zod';

import { feedCardV1Schema } from '../feed/card-v1';

const decimalString = z.string().regex(/^-?\d+(\.\d+)?$/);
const isoInstant = z.string().datetime({ offset: true });

export const d0FixtureSchema = z.object({
  version: z.literal('d0.v1'),
  mode: z.literal('fixture'),
  seed_user: z.object({ id: z.literal('user_demo_0001'), name: z.string(), avatar_key: z.literal('demo-avatar') }),
  market: z.object({ source: z.literal('huoqiu-synthetic'), as_of: isoInstant }),
  instruments: z.array(z.object({
    instrument_id: z.string(), listing_id: z.string(), symbol: z.string(), name: z.string(),
    pinyin: z.string(), aliases: z.array(z.string()), market: z.enum(['CN', 'HK', 'US']),
    currency: z.enum(['CNY', 'HKD', 'USD']), status: z.enum(['open', 'closed', 'halted']),
  })).min(1),
  quotes: z.array(z.object({
    listing_id: z.string(), last: decimalString, change: decimalString, change_pct: decimalString,
    source: z.literal('huoqiu-synthetic'), as_of: isoInstant, stale: z.boolean(),
    entitlement: z.literal('synthetic'),
  })),
  bars: z.array(z.object({ listing_id: z.string(), interval: z.literal('1d'), points: z.array(z.object({ at: isoInstant, open: decimalString, high: decimalString, low: decimalString, close: decimalString, volume: decimalString })) })),
  feed: z.array(feedCardV1Schema),
});
```

`packages/contracts/src/feed/card-v1.ts` 是 D0 Fixture 与 M1 API 共用的唯一 Card v1 Schema，公共字段不得在 M1 重新定义：

```ts
import { z } from 'zod';

export const feedCardV1Schema = z.object({
  type: z.enum(['post', 'news', 'market_strip', 'topic', 'ops_banner']),
  schema_version: z.literal(1),
  card_id: z.string().min(1),
  published_at: z.string().datetime({ offset: true }),
  source: z.string().min(1),
  permissions: z.object({
    alpha_access: z.literal(true),
    visibility: z.enum(['alpha-public', 'owner', 'reviewer']),
  }),
  payload: z.record(z.string(), z.unknown()),
});
```

- [ ] **Step 4: 写入确定性 Fixture**

Fixture 必须至少包含 `SYN001 / 合成示例一号 / listing_syn_0001`、20 个日 K 点、一个 `market_strip` 和两个内容卡；每条 quote 固定写 `source/stale/entitlement`，每张 Feed Card 固定写 `permissions`；不得包含真实个人信息或真实供应商名称。

- [ ] **Step 5: 验证 quote/bar 确定性与未知 Feed 卡拒绝**

```bash
pnpm exec vitest run packages/contracts/test/d0-fixture.contract.spec.ts packages/contracts/test/synthetic-market-fixture.spec.ts packages/contracts/test/feed-card-v1.spec.ts
```

预期：`3 files passed`，`failed=0`，`skipped=0`。

- [ ] **Step 6: 提交**

```bash
git add packages/contracts
git commit -m "feat(contracts): add versioned D0 fixture"
```

## Task 2: 建立 Web D0 状态容器与应用壳

**Files:**

- Create: `apps/web/src/lib/d0-fixture.ts`
- Create: `apps/web/src/stores/d0-watchlist.ts`
- Create: `apps/web/src/components/shell/desktop-shell.tsx`
- Create: `apps/web/src/components/system/demo-data-badge.tsx`
- Create: `apps/web/src/components/system/page-state.tsx`
- Create: `apps/web/tests/component/d0/seed-session.spec.tsx`
- Create: `apps/web/tests/component/d0/state-matrix.spec.tsx`
- Modify: `apps/web/package.json`

- [ ] **Step 1: 写 seed identity 与状态矩阵失败测试**

```tsx
render(<DesktopShell><div>内容</div></DesktopShell>);
expect(screen.getByText('演示用户')).toBeVisible();
expect(screen.getByText('演示数据')).toBeVisible();
expect(screen.queryByText('私募认购')).not.toBeInTheDocument();
```

- [ ] **Step 2: 运行组件测试并确认失败**

```bash
pnpm --filter @huoqiu/web exec vitest run tests/component/d0/seed-session.spec.tsx tests/component/d0/state-matrix.spec.tsx
```

- [ ] **Step 3: 注册 Web D0 精确测试命令**

```json
{
  "scripts": {
    "test:d0": "vitest run tests/component/d0"
  }
}
```

- [ ] **Step 4: 实现 Fixture loader 和只读 session**

`loadD0Fixture()` 必须在模块加载时调用 `d0FixtureSchema.parse`；解析失败时返回错误页面，不允许静默降级为任意对象。

- [ ] **Step 5: 实现本地自选 store**

```ts
type D0WatchlistState = {
  listingIds: string[];
  add(listingId: string): void;
  remove(listingId: string): void;
  has(listingId: string): boolean;
  reset(): void;
};
```

`add` 使用集合语义并保持插入顺序；界面显示“仅本机演示，不会跨端同步”。

- [ ] **Step 6: 实现桌面三栏与窄屏单栏壳**

左栏只注册首页、自选；顶部注册全局搜索；右栏只渲染 Fixture 榜单。未实现导航不得出现。

- [ ] **Step 7: 运行测试与提交**

```bash
pnpm --filter @huoqiu/web test:d0
pnpm --filter @huoqiu/web typecheck
git add apps/web packages/web-ui
git commit -m "feat(web): add D0 fixture shell and states"
```

## Task 3: 实现 Web 首页 Feed

**Files:**

- Modify: `apps/web/src/app/page.tsx`
- Create: `apps/web/src/components/feed/feed-card.tsx`
- Create: `apps/web/src/components/feed/market-strip-card.tsx`
- Create: `apps/web/src/components/feed/post-card.tsx`
- Create: `apps/web/src/components/feed/news-card.tsx`
- Create: `apps/web/src/components/feed/topic-card.tsx`
- Create: `apps/web/src/components/feed/ops-banner-card.tsx`
- Create: `apps/web/tests/component/d0/feed.spec.tsx`

- [ ] **Step 1: 写正常、加载、空、错误和未知卡测试**

未知 `type` 必须跳过并调用遥测 stub；空数组显示“暂无演示内容”；错误显示重试按钮；加载显示稳定骨架屏。

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm --filter @huoqiu/web exec vitest run tests/component/d0/feed.spec.tsx
```

- [ ] **Step 3: 实现白名单 card registry**

```ts
export const d0CardRegistry = {
  market_strip: MarketStripCard,
  post: PostCard,
  news: NewsCard,
  topic: TopicCard,
  ops_banner: OpsBannerCard,
} as const;
```

- [ ] **Step 4: 复刻参考信息层级但使用火球视觉 token**

页面必须包含顶部搜索、频道横栏、市场条、内容卡、左右辅助栏；Logo、头像、图标和文案使用仓库自有资产。

- [ ] **Step 5: 验证与提交**

```bash
pnpm --filter @huoqiu/web exec vitest run tests/component/d0/feed.spec.tsx
pnpm --filter @huoqiu/web lint
git add apps/web
git commit -m "feat(web): add fixture-driven D0 feed"
```

## Task 4: 实现 Web 搜索与标的详情

**Files:**

- Create: `apps/web/src/app/search/page.tsx`
- Create: `apps/web/src/app/instruments/[listingId]/page.tsx`
- Create: `apps/web/src/components/instrument/instrument-search.tsx`
- Create: `apps/web/src/components/instrument/quote-header.tsx`
- Create: `apps/web/src/components/instrument/price-chart.tsx`
- Create: `apps/web/tests/component/d0/search.spec.tsx`
- Create: `apps/web/tests/component/d0/instrument-chart.spec.tsx`

- [ ] **Step 1: 写代码、名称、拼音、别名搜索测试**

断言 `SYN001`、`合成示例一号` 和 `hechengshili` 均落到 `listing_syn_0001`；无结果保留输入并显示空态。

- [ ] **Step 2: 写图表数据与披露测试**

详情必须显示 quote、20 个 bar、币种、市场、交易状态、`huoqiu-synthetic`、`as_of` 和“演示数据”。

- [ ] **Step 3: 运行测试并确认失败**

```bash
pnpm --filter @huoqiu/web exec vitest run tests/component/d0/search.spec.tsx tests/component/d0/instrument-chart.spec.tsx
```

- [ ] **Step 4: 实现纯函数搜索和详情 loader**

```ts
export function searchD0Listings(query: string, fixture: D0Fixture): D0Instrument[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  if (!normalized) return [];
  return fixture.instruments.filter((item) =>
    [item.symbol, item.name, item.pinyin, ...item.aliases]
      .some((value) => value.toLocaleLowerCase('zh-CN').includes(normalized)),
  );
}
```

- [ ] **Step 5: 用 ECharts SVG/Canvas 渲染只读日 K**

图表实例在卸载时 dispose；无点显示空态；错误不渲染伪造折线；颜色使用中国市场红涨绿跌语义 token。

- [ ] **Step 6: 验证与提交**

```bash
pnpm --filter @huoqiu/web test:d0
pnpm --filter @huoqiu/web build
git add apps/web
git commit -m "feat(web): add D0 search and instrument detail"
```

## Task 5: 实现 Web 加减自选闭环

**Files:**

- Create: `apps/web/src/app/watchlist/page.tsx`
- Create: `apps/web/src/components/watchlist/watch-toggle.tsx`
- Create: `apps/web/src/components/watchlist/watchlist-table.tsx`
- Create: `apps/web/tests/component/d0/watchlist.spec.tsx`

- [ ] **Step 1: 写幂等加减、往返保持和空态测试**

重复点击加入按钮后列表只出现一次；取消后为空；刷新页面时若 store 未持久化，明确重置并显示“仅本次演示”。

- [ ] **Step 2: 运行失败测试**

```bash
pnpm --filter @huoqiu/web exec vitest run tests/component/d0/watchlist.spec.tsx
```

- [ ] **Step 3: 实现详情页与自选页共享 store**

加入成功按钮变为“已加自选”，取消失败时恢复先前 UI；D0 不发送网络 mutation。

- [ ] **Step 4: 验证与提交**

```bash
pnpm --filter @huoqiu/web test:d0
git add apps/web
git commit -m "feat(web): complete D0 watchlist loop"
```

## Task 6: 实现 Expo 四页导航壳

**Files:**

- Modify: `apps/mobile/app/_layout.tsx`
- Create: `apps/mobile/app/(tabs)/_layout.tsx`
- Create: `apps/mobile/app/(tabs)/home.tsx`
- Create: `apps/mobile/app/(tabs)/watchlist.tsx`
- Create: `apps/mobile/app/search.tsx`
- Create: `apps/mobile/app/instrument/[listingId].tsx`
- Create: `apps/mobile/src/lib/d0-fixture.ts`
- Create: `apps/mobile/src/stores/d0-watchlist.ts`
- Create: `apps/mobile/tests/component/d0/seed-session.spec.tsx`
- Create: `apps/mobile/tests/component/d0/feed.spec.tsx`
- Create: `apps/mobile/tests/component/d0/search.spec.tsx`
- Create: `apps/mobile/tests/component/d0/instrument-chart.spec.tsx`
- Create: `apps/mobile/tests/component/d0/watchlist.spec.tsx`
- Modify: `apps/mobile/package.json`

- [ ] **Step 1: 写四页导航与相同 Fixture ID 的失败测试**

测试首页、搜索、详情、自选四页都能访问，并断言详情使用 `listing_syn_0001` 而不是平台自造 ID。

- [ ] **Step 2: 运行测试确认失败**

```bash
pnpm --filter @huoqiu/mobile test:d0
```

- [ ] **Step 3: 注册 Mobile D0 精确测试命令**

```json
{
  "scripts": {
    "test:d0": "vitest run tests/component/d0"
  }
}
```

- [ ] **Step 4: 实现底部导航和顶部搜索**

D0 运行底栏只注册“火球”和“自选”，搜索从顶部入口进入。基金、策略研究、我的以及其他 Out/Off/LicensedOnly 能力不得出现在运行 registry、Tab、按钮、搜索联想或 Deep Link；如需解释参考截图，只能放在不进入构建的设计注释中。

- [ ] **Step 5: 实现移动 Feed、搜索、详情和本地自选**

共享 Zod Schema 与 Fixture 文件；平台组件使用 `packages/native-ui`。详情图表优先 SVG renderer，若 Spike 失败，只在 D0 使用经过 CSP 限制的本地 ECharts WebView。

- [ ] **Step 6: 实现所有页面状态**

通过测试注入 `normal | loading | empty | error`；错误态提供重试，离线状态不得写“已同步”。

- [ ] **Step 7: 验证与提交**

```bash
pnpm --filter @huoqiu/mobile test:d0
pnpm --filter @huoqiu/mobile typecheck
pnpm --filter @huoqiu/mobile exec expo export --platform web
git add apps/mobile packages/native-ui
git commit -m "feat(mobile): add D0 four-screen fixture demo"
```

## Task 7: 建立 D0 Web 黄金路径

**Files:**

- Create: `tests/e2e/playwright.config.ts`
- Create: `tests/e2e/playwright/d0/golden.spec.ts`
- Create: `tests/e2e/playwright/d0/state-matrix.spec.ts`
- Create: `tests/e2e/fixtures/load-d0-fixture.ts`

- [ ] **Step 1: 写尚未通过的黄金路径**

```ts
test('seed identity -> feed -> search -> detail -> watchlist', async ({ page }) => {
  await page.goto('/?fixture=d0.v1');
  await expect(page.getByText('演示数据')).toBeVisible();
  await page.getByRole('searchbox').fill('SYN001');
  await page.getByRole('button', { name: '搜索' }).click();
  await page.getByRole('link', { name: /合成示例一号/ }).click();
  await expect(page).toHaveURL(/instruments\/listing_syn_0001/);
  await expect(page.getByText('huoqiu-synthetic')).toBeVisible();
  await page.getByRole('button', { name: '加自选' }).click();
  await page.getByRole('link', { name: '自选' }).click();
  await expect(page.getByText('合成示例一号')).toHaveCount(1);
});
```

- [ ] **Step 2: 运行并保存第一次失败 trace**

```bash
pnpm exec playwright test -c tests/e2e/playwright.config.ts tests/e2e/playwright/d0 --project=chromium
```

- [ ] **Step 3: 补齐稳定 locator、测试隔离和零业务 API 断言**

每个测试前调用 D0 store reset；禁止用固定 sleep。Playwright 在 context 级拦截全部请求，只要 URL pathname 以 `/v1` 开头，不论 GET/POST/PUT/DELETE 都立即让测试失败并记录 method/URL；D0 只允许本地 Fixture、静态资产和 Next.js 自身资源。

- [ ] **Step 4: 连续运行三次**

```bash
pnpm exec playwright test -c tests/e2e/playwright.config.ts tests/e2e/playwright/d0 --project=chromium --repeat-each=3
```

预期：`6 passed, 0 failed, 0 skipped`，保留 screenshot、video 和 trace。

- [ ] **Step 5: 提交**

```bash
git add tests/e2e
git commit -m "test(e2e): cover D0 web golden path"
```

## Task 8: 建立 Mobile 启动与 Maestro 证据

**Files:**

- Create: `tests/e2e/maestro/d0/golden.yaml`
- Create: `scripts/quality/mobile-d0-evidence.mts`
- Modify: `package.json`

- [ ] **Step 1: 写 Maestro flow**

Flow 依次断言首页“演示数据”、搜索 `SYN001`、打开 `listing_syn_0001`、加入自选并在自选页只出现一次。

根 `package.json` 保留 Wave 0 注册的精确命令，不允许改名或用 Expo Web 代替：

```json
{
  "e2e:mobile:d0:ios": "tsx scripts/quality/mobile-d0-evidence.mts --platform ios",
  "e2e:mobile:d0:android": "tsx scripts/quality/mobile-d0-evidence.mts --platform android"
}
```

- [ ] **Step 2: 检查本机 iOS/Android 工具链**

```bash
xcrun simctl list devices available
adb devices
```

- [ ] **Step 3: 工具链可用时分别启动并执行**

```bash
pnpm e2e:mobile:d0:ios
pnpm e2e:mobile:d0:android
```

每个平台成功输出：`1 Flow Passed`。

- [ ] **Step 4: 工具链缺失时保存真实阻塞证据**

脚本必须输出 `D0_MOBILE NOT_VERIFIED reason=<exact toolchain blocker>`，同时保存 `expo export --platform web` 与 `expo prebuild --no-install` 日志；报告中不得写 iOS/Android 已通过。

- [ ] **Step 5: 提交**

```bash
git add tests/e2e/maestro scripts/quality package.json
git commit -m "test(mobile): add D0 launch evidence"
```

## Task 9: 运行 D0 Gate 与独立复核

**Files:**

- Modify: `quality/manifests/d0-required.json`
- Modify: `package.json`
- Create: `artifacts/evidence/$BUILD_SHA/reviews/d0-review.json`（由复核脚本生成，不手改）

- [ ] **Step 1: Manifest 只登记 oracle 中的 5 个 Required CAP**

每项登记 unit/component/E2E 命令、证据路径和 `implementer_ids`；Stretch 字段为空数组。不得预填 reviewer 或从该 manifest 推导 Required 范围，Gate 必须与 `quality/oracles/d0-required.json` 精确对比。

- [ ] **Step 2: 先提交 Gate 输入并确认检出干净**

```bash
git add quality/manifests/d0-required.json package.json
git commit -m "chore(quality): prepare D0 certification inputs"
test -z "$(git status --porcelain)"
```

此后任何代码、契约、Fixture、配置或 manifest 变化都会使复核和测试证据失效，必须从本步骤后的当前 HEAD 全量重跑。

- [ ] **Step 3: 从当前 HEAD 运行完整静态与 D0 自动化检查**

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm exec playwright test -c tests/e2e/playwright.config.ts tests/e2e/playwright/d0 --project=chromium --repeat-each=3
```

- [ ] **Step 4: 独立复核当前 SHA 的截图与交互**

复核人检查火球品牌、无雪球私有素材、正常/加载/空/错误状态、数据来源与时点、无死按钮、窄屏布局、键盘导航和移动触控目标。`record-review.mts` 从证据读取 `implementer_ids`，拒绝同人复核，并把当前 `commit_sha/contract_sha/fixture_sha/config_sha`、P0/P1 和原始清单 SHA-256 写入结构化复核记录：

```bash
BUILD_SHA=$(git rev-parse HEAD)
pnpm exec tsx scripts/quality/record-review.mts --milestone d0 --commit-sha "$BUILD_SHA"
```

若发现 P0/P1，记录失败并停止；修复后生成新 HEAD，重新执行 Step 2–4。

- [ ] **Step 5: 最后运行消费复核签字的 D0 Gate**

```bash
pnpm gate:d0
```

预期：

```text
D0_GATE PASS required_caps=5 failed=0 skipped=0 p0=0 p1=0
```

Gate 后不得再产生代码或配置 commit；原始证据与复核记录由 CI 作为不可变 artifact 上传，并在 Gate 输出中记录 artifact URI 和 manifest SHA-256。任何后续 commit 都必须重新执行 Step 3–5。

## D0 退出清单

- [ ] Web 黄金路径完整通过，且三次重复无偶发失败。
- [ ] App 四页使用同一 Fixture Schema 和稳定 listing ID。
- [ ] 5 个 Required CAP 的页面、状态、触点、测试和证据追踪率 100%。
- [ ] 未实现与受限能力在导航、搜索、Deep Link、按钮和 Fixture 中均不可达。
- [ ] 不含生产密钥、个人数据、外部行情请求和真实交易文案。
- [ ] 范围内 P0/P1 为零，D0 报告明确写“Demo Ready，不是 MVP”。
