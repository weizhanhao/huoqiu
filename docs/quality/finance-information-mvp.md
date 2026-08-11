# 财经资讯纵向切片品控报告

基线：`ebc586ea69d535b2847f2eb18a8c03f297844ff0`

## 路由契约

- `/news`：财经资讯中心；频道为全部、市场、公司、公告、专栏。
- `/7x24`：独立可深链的固定快讯时间线，按绝对日期与时间分组。
- `/news/[newsId]`：固定合成资讯详情；当前静态生成 6 条详情路由。

`/news` 与 `/7x24` 是不同 URL。最终集成只需在共享频道导航中分别接入唯一的 active/current 状态；本切片没有修改共享壳层。

## 数据与功能边界

- 仅使用仓库内固定合成 Fixture；内容覆盖快讯、公司新闻、公告和深度专栏。
- 标题、正文、时间、来源、话题和关联合成标的均为离线原创演示内容。
- 本地筛选与搜索不会向外部数据源发起请求。
- 分享明确标记为暂未开放；收藏只保留在当前页面会话。
- 所有页面始终显示“演示数据 / 合成数据”和“不构成投资建议”。
- 没有新增 API、数据库、真实媒体源、真实行情或交易能力。

## 验证证据

- TDD：先证明 fixtures/query、`/news`、`/7x24`、详情路由和 Chrome harness 缺失，再逐个实现到 GREEN。
- Focused Vitest：3 files / 12 tests passed。
- Full Web Vitest：22 files / 301 tests passed。
- TypeScript：`tsc --noEmit -p apps/web/tsconfig.json` passed。
- Configured ESLint：Web `src`、`scripts`、`tests`、配置文件 passed。
- Prettier check 与 `git diff --check` passed。
- Optimized Next build passed；生成 `/news`、`/7x24` 与 6 条资讯详情。
- 真实 Chrome：390 / 768 / 1440 三视口无横向溢出；console、page、HTTP 错误均为 0。
- Axe：三个路由在三视口 serious / critical violations 均为 0。
- 移动端 feature controls：全部至少 44 × 44 px。

## 已知缺口

- 共享频道导航的 `/news`、`/7x24` Link 与唯一 active/current 状态由最终集成任务接线。
- 收藏不会持久化，分享不可用；这是本轮明确的演示边界。
- 内容与时间是固定合成快照，不是实时资讯。
- 本轮不包含需要资质的交易、开户、基金申购或真实行情能力。
