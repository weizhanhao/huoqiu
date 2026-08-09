# 火球开源技术栈复核（2026-08-08）

## 1. 审查截点与判定口径

- **审查截点：** 2026-08-08。
- **来源口径：** 仅采用项目官方仓库、官方发布页和官方集成文档；版本号是本次复核的固定候选基线，不表示允许自动升级。
- **仓库基线：** 本次审查识别到 React `19.2.8`、Fastify `5.11.3` 为审查截点的最新候选；当前 lockfile 仍为 React `19.2.3`（React Native `0.86.2` 兼容基线）和 Fastify `5.11.2`（认证 spike 基线）。最新候选不触发自动升级：React 只有通过 Expo、iOS、Android 全套 gate 后才升级，Fastify 只有通过认证全套 gate 后才升级。
- **判定标签：** `ADOPT` 表示可按本文边界进入实现；`CONDITIONAL` 表示必须先完成列出的许可证、适配或真实集成验证；`REJECT` 表示不得进入产品代码、运行时或交付物。
- **合规口径：** 开源代码许可证只回答“代码能否按许可证使用”，不授予行情、新闻、基金、社区内容或其它第三方数据的展示与再分发权。
- **产品口径：** 本次只评估可组合的社区、行情展示和工程基础设施，不引入交易执行能力，也不把外部项目的品牌、素材或数据源作为火球产品资产。

## 2. 核心栈决策

### 2.1 ADOPT：直接采用

| 领域                                   | 固定版本                              | 许可证                          | 一手来源                                                                                                                       | 使用边界与关键风险                                                                   |
| -------------------------------------- | ------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Web：Next.js / React                   | Next.js `16.3.0`；React `19.2.8`      | MIT / MIT                       | [Next.js](https://github.com/vercel/next.js)；[React](https://github.com/facebook/react)                                       | 作为 Web 主框架；版本固定，升级必须重新跑兼容性与回归门禁。                          |
| App：Expo（Router 方案）/ React Native | Expo `57.0.11`；React Native `0.86.2` | MIT / MIT                       | [Expo](https://github.com/expo/expo)；[React Native](https://github.com/facebook/react-native)                                 | 作为 iOS、Android 主路径；原生证据必须在真实 iOS/Android 工具链分别产生。            |
| API：NestJS / Fastify                  | NestJS `11.1.28`；Fastify `5.11.3`    | MIT / MIT                       | [NestJS](https://github.com/nestjs/nest)；[Fastify](https://github.com/fastify/fastify)                                        | 作为 API 主框架与 HTTP 适配器；认证适配不得假定两者插件行为等价。                    |
| Schema：Zod                            | `4.4.3`                               | MIT                             | [Zod](https://github.com/colinhacks/zod)                                                                                       | 作为边界校验与类型契约基础；不得以运行时校验替代授权和业务规则。                     |
| ORM / 数据库：Drizzle / PostgreSQL     | Drizzle `0.45.2`；PostgreSQL `17.10`  | Apache-2.0 / PostgreSQL License | [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm)；[PostgreSQL 17.10](https://www.postgresql.org/docs/release/17.10/) | 作为持久化主路径；迁移、回滚、权限和恢复仍需独立门禁。                               |
| Web 图表：Apache ECharts               | `6.1`                                 | Apache-2.0                      | [Apache ECharts](https://github.com/apache/echarts)                                                                            | 用于通用可视化；图表组件不自带行情数据授权。                                         |
| 富文本：Tiptap core                    | `3.29.2`                              | MIT                             | [Tiptap](https://github.com/ueberdosis/tiptap)                                                                                 | 只采用 core；其它包、扩展或服务在引入前另行审查。                                    |
| 运营后台：React Admin                  | `5.15.1`                              | MIT                             | [React Admin](https://github.com/marmelab/react-admin)                                                                         | 仅用于内部运营后台，不作为用户端 UI 基座。                                           |
| Web / App 自动化：Playwright / Maestro | Playwright `1.62.1`；Maestro `2.8`    | Apache-2.0 / Apache-2.0         | [Playwright](https://github.com/microsoft/playwright)；[Maestro](https://github.com/mobile-dev-inc/Maestro)                    | Web 证据与真实 native 证据分离记录；不得用 Web 或模拟结果冒充 iOS/Android 原生通过。 |

### 2.2 CONDITIONAL：满足条件后采用

| 领域                                    | 固定版本                       | 许可证             | 一手来源                                                                                                                                                                                        | 采用条件与关键风险                                                                                       |
| --------------------------------------- | ------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| API 契约：ts-rest                       | `3.52.1`                       | MIT                | [ts-rest](https://github.com/ts-rest/ts-rest)                                                                                                                                                   | 固定版本并置于适配层之后；稳定版节奏风险不得向业务域扩散。                                               |
| 认证主候选：Better Auth                 | `1.6.26`                       | MIT                | [Better Auth](https://github.com/better-auth/better-auth)；[NestJS 集成](https://www.better-auth.com/docs/integrations/nestjs)；[Expo 集成](https://www.better-auth.com/docs/integrations/expo) | 先通过 Nest 社区集成、Fastify 适配和 Expo 安全会话 spike；任一关键路径失败即不进入主线。                 |
| 认证唯一回退：Keycloak                  | `26.7.1`                       | Apache-2.0         | [Keycloak 26.7.1](https://github.com/keycloak/keycloak/releases/tag/26.7.1)                                                                                                                     | 仅在 Better Auth spike 失败时启用；不得与主候选并行形成双认证源。                                        |
| PostgreSQL 客户端：postgres.js          | `3.4.9`                        | Unlicense          | [postgres.js](https://github.com/porsager/postgres)                                                                                                                                             | 组织接受 Unlicense 后才能采用；若拒绝，则更换客户端并对替代项另行做版本与许可证复核。                    |
| App 图表适配：Wuba React Native ECharts | `3.1.1`                        | MIT                | [React Native ECharts](https://github.com/wuba/react-native-echarts)                                                                                                                            | 必须通过 Expo/React Native 目标版本的渲染、性能与原生构建验证；失败时保留 ECharts 数据模型但更换适配层。 |
| 队列：BullMQ / Valkey                   | BullMQ `6.0.9`；Valkey `9.1.1` | MIT / BSD-3-Clause | [BullMQ](https://github.com/taskforcesh/bullmq)；[Valkey](https://github.com/valkey-io/valkey)                                                                                                  | 必须完成真实协议集成、失败恢复和版本兼容验证，不能只凭接口或 mock 结果批准。                             |

## 3. 五个可组合候选及边界

这些项目是局部能力或设计参考，不是可整体 fork 的火球基座，也不默认进入生产依赖。

| 候选                  | 固定版本  | 许可证     | 一手来源                                                       | 允许用途                               | 禁止/限制                                                              |
| --------------------- | --------- | ---------- | -------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Lightweight Charts    | `5.2`     | Apache-2.0 | [官方仓库](https://github.com/tradingview/lightweight-charts)  | 有条件用于 Web K 线和轻量行情图表。    | 不提供或替代行情数据授权；需先验证与当前 React/Next 组合。             |
| AKShare               | `1.18.83` | MIT        | [官方仓库](https://github.com/akfamily/akshare)                | 只在隔离 research 环境做 schema 对照。 | 不进入生产数据链路；MIT 代码许可不等于其上游数据可展示、缓存或再分发。 |
| Qlib                  | `0.9.7`   | MIT        | [官方仓库](https://github.com/microsoft/qlib)                  | 只用于离线研究与方法验证。             | 不接入线上个性化建议、交易或用户资产路径。                             |
| Portfolio Performance | `0.86.1`  | EPL-1.0    | [官方仓库](https://github.com/portfolio-performance/portfolio) | 仅借鉴账本模型和交互思路。             | 不复制源码、不嵌入交付物；任何代码级复用必须重新做 EPL 边界审查。      |
| Flarum                | `1.8.17`  | MIT        | [官方仓库](https://github.com/flarum/framework)                | 仅借鉴社区机制和信息架构。             | 不嵌入 PHP 运行时；不采用 `2.0 RC` 作为生产基线。                      |

## 4. 明确排除（REJECT）

| 排除类别                   | 项目/对象                                      | 原因与处置                                                                 |
| -------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------- |
| AGPL                       | Ghostfolio、Maybe、OpenBB、rotki               | 不进入产品源码、服务端运行时或发行物；避免形成超出当前策略的网络分发义务。 |
| GPL                        | Freqtrade、Backtrader                          | 不进入产品源码、运行时或发行物。                                           |
| 交易执行越界               | LEAN（Apache）、vn.py（MIT）                   | 即使许可证宽松，其核心交易执行能力超出当前产品边界，因此不采用。           |
| 未知许可证、停更或专有资产 | 本次发现的现存 Xueqiu clone                    | 不 fork、不复制代码或素材，也不把其实现当作可信依赖。                      |
| 未知许可证的一般项目       | 无法确认许可证或权利链的代码、模板、素材和数据 | 默认拒绝；只有完成来源、许可证和资产权利复核后才能重新评估。               |

## 5. 结论

本次复核没有发现同时满足许可证清晰、维护状态可接受、业务边界合规且能覆盖 Web + App + 社区 + 行情展示的完整成品。**没有可整体 fork 的合规活跃成品，采用模块化组合。**

落地顺序保持为：直接采用核心工程栈；条件项逐项通过 spike/真实集成门禁；五个候选只在明确边界内组合或借鉴；所有交易执行、未知许可证、AGPL/GPL 和未经授权的数据链路继续保持关闭。
