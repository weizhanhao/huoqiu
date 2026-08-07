# 火球投资社区平台产品与技术设计规格

- 文档状态：产品负责人待审；G0 部分满足，G1 候选，G2–G6 未通过
- 版本：1.0
- 日期：2026-08-08
- 工作名称：火球
- 目标平台：Web、iOS、Android、运营管理端

## 1. 文档目的

本规格把已经确认的产品方向、页面参考、功能范围、技术架构、开源复用策略、交付节奏和质量门禁固化为一份可执行基线。

项目目标是建设一套高完整度的投资信息、行情工具、社区内容、自选与模拟组合平台。产品在功能结构、信息密度和关键交互上参考雪球，但使用火球自己的名称、视觉系统、图标、文案、素材、代码和数据授权。不得复制雪球的商标、私有接口、受版权保护素材、私有代码、用户数据或绕过访问控制。

本规格不把“页面做出来”视为功能完成。每项能力必须可追踪到需求、页面、状态、触点、接口或事件、数据、测试和证据。

## 2. 产品目标与成功口径

### 2.1 产品目标

1. 提供覆盖 A 股、港股、美股、指数、基金和 ETF 的统一标的浏览、搜索和行情体验。
2. 提供短讨论、长文、评论、点赞、收藏、关注、话题、资讯、视频和频道化信息流。
3. 提供跨 Web 与 App 同步的自选、提醒和模拟组合能力。
4. 提供可由运营团队配置的频道、推荐位、热门榜、话题、内容治理和用户治理后台。
5. 提供受控的 AI 摘要、解释和检索入口，所有金融结果保留来源、时点和风险边界。
6. 建立可持续扩展的模块化架构，使 Web 先行不会牺牲 App、数据一致性和长期演进。

### 2.2 高完整度定义

能力总账中的每项能力采用以下状态：

| 状态 | 含义 |
|---|---|
| 已发现 | 已从参考产品、业务目标或合规要求识别 |
| 已设计 | 页面、状态、触点、接口、数据和验收已明确 |
| 已实现 | 代码和迁移已进入集成主干 |
| 已验证 | 当前构建在目标环境通过自动化与人工验收 |
| 已发布 | 已进入目标发布环境并有监控、回滚和负责人 |
| 资质延期 | 能力属于持牌或受限范围，已隔离且不可达 |
| 明确排除 | 产品负责人确认不进入产品 |

只有“已验证”或“已发布”计入功能完成度。未知项、死按钮、仅有静态页面、仅有 Fixture 而未标注、无服务端状态或无验收证据均不计完成。

### 2.3 统一追踪链

每项能力使用唯一标识并形成双向追踪：

REQ → CAP → PAGE → STATE → TOUCH → API/EVENT → DATA → TEST → EVIDENCE

任何一环断开，该能力不能标记为已验证。

## 3. 边界与非目标

### 3.1 首期允许

- 经书面授权允许目标渠道商业展示的证券主数据、延迟行情、沙箱行情，以及完全合成并明确标识的演示数据；“公开可访问”本身不构成再分发权。
- 内容社区、自选、提醒、模拟组合、规则推荐、搜索、资讯聚合和运营管理。
- 基于来源的新闻摘要、公司资料解释、标的问答和只读 AI 工具。
- 纯信息型外链只有在法务、数据合规和运营批准后才可由 Feature Flag 开启；默认关闭。

### 3.2 首期禁止

- 未持牌情况下提供真实证券下单、基金申购赎回、开户承接、代销、资金托管、跟单或自动交易。
- 输出针对特定用户的买卖方向、目标价、仓位比例、收益承诺或自动执行建议。
- 抓取或逆向未授权行情、内容、账号、评论或接口。
- 将演示或延迟数据描述为实时生产行情。
- 让 AI 读取无授权的持仓、私信、身份信息或执行写操作。
- 复用 AGPL、GPL、商业企业版或未知许可证代码进入发布产物，除非另有书面批准和隔离方案。

### 3.3 品牌边界

- 火球使用自己的品牌名、Logo、插画、头像、图标和营销文案。
- 参考截图只用于归纳功能、布局层级、状态和交互。
- 视觉回归以火球批准后的设计基线为准，而不是以复制雪球像素为目标。
- 页面信息架构可以对齐用户习惯，但需避免来源混淆和品牌仿冒。

### 3.4 合规处置表

| 能力 | 处置 | 首期规则 |
|---|---|---|
| 社区内容能力 | Allowed | 最小审核只允许内部 Alpha；公网前必须具备举报、处置、通知、申诉、第二复审、审计、急停和具名运营负责人 |
| 延迟/合成行情 | Allowed | 显示来源、as_of 和“延迟/演示”标识 |
| 基金、ETF 公开资料 | Allowed | 只读信息，须有展示权；不承接申购、赎回或适当性流程 |
| 私募策略研究内容 | Allowed | 只做研究内容和工具，不展示具体私募产品、额度、认购或开户链接 |
| 私募产品展示、销售 | LicensedOnly | 首期路由、API、导航和搜索均不可达 |
| 私有模拟组合 | Allowed | 仅本人可见，用于记录和复盘 |
| 公开组合排行、调仓播报、可复制组合 | FeatureFlagOff | 默认关闭；法律评审和独立规格通过前不可达 |
| 事实型价格提醒 | Allowed | 只描述阈值触发，不生成买卖指令 |
| AI 有来源摘要 | FeatureFlagOff | M1 Stretch；通过引用、安全和数据最小化检查后才开启 |
| AI 个性化买卖、仓位或目标价 | Forbidden | 服务端不得存在相关命令 |
| 外部开户、交易、申赎导流 | LicensedOnly | 首期默认关闭，不能以中性按钮绕过 |
| 打赏和付费荐股 | LicensedOnly | 首期不可达 |

## 4. 用户角色

| 角色 | 主要能力 |
|---|---|
| 游客 | 浏览公开 Feed、标的、资讯、话题和市场榜单；搜索；查看延迟或演示行情；不可查看他人组合 |
| 注册用户 | 发帖、评论、点赞、收藏、关注、自选、提醒、模拟组合、消息和个性化频道 |
| 创作者 | 长文、视频、草稿、数据看板、内容申诉和创作者中心 |
| 运营人员 | 频道配置、推荐位、话题、榜单、活动、公告和内容编排 |
| 审核人员 | 举报队列、内容处置、用户处置、申诉复审、证据留存和审计 |
| 系统管理员 | 角色权限、供应商配置、功能开关、数据源状态、审计和应急控制 |
| 持牌合作方 | 仅通过隔离域和经批准接口承接持牌业务，首期产品不实现该域 |

## 5. 信息架构与页面清单

### 5.1 Web 全局框架

Web 采用三栏桌面布局：

- 顶部：火球品牌、全局搜索、AI 入口、客服或帮助、消息、下载 App。
- 左栏：用户摘要、发帖按钮、首页、自选、行情、基金资料、策略研究、私有模拟资产、创作者中心、消息及其二级入口。
- 中栏：首页频道和内容 Feed，或当前业务主页面。
- 右栏：热门话题、涨跌幅榜、热门基金、运营卡片和 AI 浮动入口。

窄屏 Web 退化为单栏，保留顶部搜索、频道横滑和关键操作，不强制复刻桌面三栏。

### 5.2 App 全局框架

底部主导航：

1. 火球：首页、关注、推荐、热门、7×24、视频、自选内容频道、基金资料、资讯、达人、策略研究、ETF。
2. 自选：自选、行情、组合。
3. 基金：基金工具、基金筛选、指数估值、组合回测等。
4. 策略研究：只读研究内容与工具；具体私募产品、认购、销售和适当性流程在首期完全不可达。
5. 我的：账号、消息、设置、模拟能力、帮助和运营入口。

App 顶部包含搜索、AI、发布和消息。频道支持管理、排序、启用与停用。

### 5.3 首批页面族

| 页面族 | Web | App | 关键状态 |
|---|---|---|---|
| 首页 Feed | 三栏 Feed、频道、榜单 | 顶部蓝色区域、频道横滑、底栏 | 加载、空、错误、陈旧、离线、游客、已登录 |
| 关注/推荐/热门 | 独立频道 | 独立频道 | 无关注、推荐降级、屏蔽内容、刷新 |
| 7×24 | 时间线 | 快讯卡片 | 实时连接、断线重连、延迟、历史加载 |
| 视频 | Feed 视频卡 | 视频卡与播放器 | 未自动播放、静音、失败、弱网 |
| 资讯/达人/基金资料/策略研究/ETF | 频道 Feed | 频道 Feed | 来源、时点、资质隔离、空态 |
| 自选首页 | 表格与推荐标的 | 热门/最近/全部/市场分组 | 无自选、排序、批量添加、跨端同步 |
| 行情首页 | 指数、市场宽度、异动 | A/港/美/全球/外汇/基金/期货 | 休市、延迟、部分供应商故障 |
| 私有组合 | 本人组合列表与复盘 | 本人盈亏概况、持仓和账本 | 无组合、陈旧估值、币种、重放失败；公开榜单和播报关闭 |
| 标的详情 | 报价、图表、讨论、成分/资料 | 报价、分时/K 线、讨论、成分、资讯、公告、相关 ETF | 交易中、休市、停牌、无数据、受限 |
| 搜索 | 证券/内容/用户/话题 | 猜你想搜、热股、联想和结果 | 空查询、无结果、输入法、网络失败 |
| 内容详情 | 短帖/长文/视频 | 正文、作者、互动、讨论 | 已删、审核中、折叠、无权限、申诉 |
| 发布器 | 短帖与长文 | 发讨论/写长文 | 草稿、上传、失败重试、关联标的、可见性 |
| 消息 | 回复、@、赞、系统、私信 | 回复我的、提到我的、赞我的、系统 | 未读、已读、深链失效、账户切换 |
| 我的与设置 | 个人资料、关注、粉丝、收藏、资产、设置 | 我的、设置、通知、隐私、自选、模拟交易 | 游客、权限拒绝、注销、删除请求 |
| 运营审核台 | 独立管理端 | 不提供 | 队列、证据、处置、恢复、申诉、审计 |

### 5.4 关键触点

- 全局搜索支持标的名称、代码、拼音、内容、用户和话题。
- Feed 卡支持分享、评论、点赞、收藏、更多、关注、屏蔽和举报。
- 标的卡支持查看详情、加自选、取消自选、创建提醒和发讨论。
- 长文支持目录、图片、引用、标的标签、点赞、收藏和评论；打赏入口按资质边界隔离。
- 通知必须落到可恢复的业务对象；对象删除时展示稳定的不可用状态。
- 所有写操作包含加载、成功、失败、重复提交、离线重试和权限失效处理。

## 6. 核心用户旅程

### 6.1 证券发现闭环

登录或游客进入首页 → 搜索标的 → 查看标的详情和行情时点 → 加入自选 → 创建价格提醒 → 触发站内通知 → 点击通知回到标的。

### 6.2 内容互动闭环

登录 → 发布短讨论并关联标的 → 内容进入审核状态 → 审核通过后进入 Feed 和标的讨论 → 其他用户评论或点赞 → 作者收到消息 → 点击返回原内容 → 作者回复。

### 6.3 长文创作闭环

进入写长文 → 输入标题和正文 → 插入图片、话题和标的 → 自动保存草稿 → 预览 → 发布 → 审核 → 内容详情 → 评论与收藏 → 作者查看数据。

### 6.4 模拟组合闭环

创建私有组合 → 选择单一币种和初始现金 → 录入模拟已成交交易 → 账本生成持仓与现金 → 合成行情估值 → 本人查看持仓、盈亏和复盘。M1 不发布组合动态、不提供关注、排行、复制或调仓播报。

### 6.5 举报审核闭环

V1 公网治理闭环：用户举报 → 生成证据快照 → 审核人员查看上下文 → 隐藏、恢复、警告或封禁 → 通知作者 → 作者申诉 → 第二审核人复审 → 记录不可篡改审计。M1 员工 Alpha 只允许受控环境内反馈，不作为公网治理能力验收。

## 7. 系统架构

### 7.1 总体方案

首期采用模块化单体作为业务核心，避免过早微服务化；行情采集、AI 网关、异步任务和实时连接独立部署。

逻辑流：

客户端 Web / iOS / Android / Admin
→ CDN 与边缘安全层
→ API Gateway / BFF
→ 模块化业务核心
→ PostgreSQL、Valkey、对象存储、搜索引擎
→ Outbox 与消息总线
→ 行情流水线、通知、Feed 投影、审核、索引和 AI

### 7.2 推荐技术栈

| 层 | 首选 |
|---|---|
| Monorepo | pnpm workspace + Turborepo |
| Web | Next.js、React、TypeScript、Radix UI、shadcn/ui |
| App | Expo、React Native、TypeScript、Expo Router、FlashList、Reanimated |
| Auth | Better Auth；H0–H2 验证许可证、NestJS 会话和 Expo 安全存储，失败时唯一回退为独立 Keycloak OIDC |
| API | NestJS + Fastify + OpenAPI |
| ORM 与迁移 | Drizzle ORM + drizzle-kit |
| 数据库 | PostgreSQL |
| 缓存、队列与定时任务 | Valkey + BullMQ；锁定精确制品并验证 Redis 协议兼容测试 |
| M1 搜索 | PostgreSQL tsvector + pg_trgm；M2 再评估独立搜索引擎 |
| M1 实时连接 | API 提供 SSE；行情高频 WebSocket 和 Centrifugo 延后到 M2 |
| 图表 | Web 使用 Apache ECharts；App 首选 @wuba/react-native-echarts SVG renderer，H0–H2 通过许可证/SCA/Expo spike，失败时 M1 唯一回退为受限 ECharts WebView 图表并在 M2 前替换 |
| 编辑器 | Tiptap OSS core |
| M1 媒体 | 测试文件系统适配器；对象存储与媒体流水线进入 M2 |
| M1 通知 | 内部数据库 Inbox + SSE；APNS/FCM 与 Novu 不进入 Required |
| 管理端 | React Admin |
| AI | Vercel AI SDK 接入独立 AI Gateway |
| 可观测性 | OpenTelemetry、Prometheus、Jaeger；其他仪表盘制品经独立许可证批准后隔离部署 |
| 测试 | Vitest/Jest、Playwright、Maestro、契约测试和属性测试 |
| 安全与供应链 | Gitleaks、Semgrep、Syft、Grype/Trivy |
| 开发与演示部署 | Docker Compose + Linux 容器 Staging；Expo Simulator/Emulator build |

### 7.3 领域边界

| 领域 | 主要职责 | 核心数据所有权 |
|---|---|---|
| Identity | 登录、会话、设备、角色、隐私、注销 | user、identity、session、device、consent |
| Instrument Reference | 标的、上市地、市场、币种、代码映射、交易日历和公司行动事实 | instrument、listing、exchange、symbol alias、calendar、corporate action |
| Market Data | 原始供应商观测、行情规范化、快照、K 线、修订和展示授权投影 | provider observation、quote、bar、revision、entitlement projection |
| Content | 短帖、长文、视频、草稿、媒体、话题 | post、article、draft、media、topic |
| Social | 关注、评论、点赞、收藏、分享和屏蔽 | follow、comment、reaction、bookmark、block |
| Moderation | 举报、审核案件、处置、申诉、证据和领域审计 | report、moderation case、decision、appeal、evidence、moderation audit |
| Feed & Channel | Feed 投影、频道、推荐位、榜单和运营注入 | feed item、channel、ranking snapshot |
| Watchlist & Alert | 自选组、标的自选、提醒规则和触发 | watchlist、watch item、alert rule、alert trigger |
| Portfolio Simulation | 组合、追加式账本、订单填充规则、持仓和分析 | portfolio、ledger entry、position projection、valuation |
| Search | 文档索引、联想、热词和排序 | search document、query signal |
| Messaging & Notification | 站内通知、私信后续域、推送投递和已读状态 | notification、delivery、conversation、read state |
| AI | 模型路由、检索、引用、安全决策和评测 | ai run、citation、policy decision、evaluation |
| Operations | 配置、功能开关、供应商状态、跨系统管理动作审计和应急控制 | config、feature flag、provider state、system admin audit |

每张业务表只有一个写入领域。其他领域通过 API、事件或只读投影读取，不跨边界直接更新。

### 7.4 关键不变量

- user_id、instrument_id、listing_id、post_id、portfolio_id 为全局稳定 ID。
- Instrument 与 Listing 分离；同一公司在不同市场的上市实体不可混为一条。
- 时间统一存 UTC，行情另带交易所时区、交易日和 as_of。
- 金额、价格、数量使用十进制定点值和明确精度，禁止业务计算使用二进制浮点金额。
- 所有 mutation 有幂等键；重复请求不得创建重复帖子、评论、提醒或账本条目。
- 组合持仓和现金只能由追加式账本推导，不允许直接编辑最终余额。
- 公司行动只能应用一次；相同输入重放必须得到相同持仓和收益。
- 通知事件、规范通知和投递尝试使用三个独立 ID。canonical Inbox 在用户离线时也创建，但必须校验 recipient、账号和对象权限；SSE/Push delivery attempt 再校验当前会话、设备 token 所有权、屏蔽和偏好。退出或换号立即撤销 token，Deep Link 落地后再次鉴权，已读状态使用单调 watermark。
- 删除传播覆盖主库、缓存、搜索、Feed、对象存储、AI 索引、移动端缓存和受控第三方；依法留存的审核证据进入独立受限库，并与公开内容删除分离。

## 8. API、事件与一致性

### 8.1 API 规则

- 外部 API 使用版本化 REST + OpenAPI。
- 列表统一使用不透明 cursor 分页。
- 错误结构固定包含 code、用户可读消息、details 和 trace_id。details 只允许字段名、约束名的公开别名、retry_after 和冲突版本等白名单值，禁止堆栈、SQL、文件路径、Token、供应商密钥和内部对象。
- 所有写接口明确鉴权、资源权限、幂等、冲突与重试语义。
- Web 与 App 使用同一份生成 SDK，不复制 DTO。
- Demo Fixture 与真实 API 使用相同 Schema。

### 8.2 实时通道

- 低频通知和 Feed 更新优先 SSE。
- 行情订阅和高频状态更新使用 WebSocket。
- 客户端必须展示连接状态、数据时点和陈旧状态。
- 断线后从 cursor 或 sequence 恢复；不能默认丢弃间隙。

### 8.3 事件规则

事件信封包含 event_id、event_type、version、occurred_at、producer、aggregate_id、sequence、trace_id 和 payload。

事务内写业务表与 Outbox，异步消费者使用 Inbox 去重。事件消费者必须处理重复、乱序、延迟、宕机、DLQ 和重放。

### 8.4 一致性等级

| 场景 | 一致性 |
|---|---|
| 登录、权限、封禁、隐私设置 | 强一致 |
| 自选写入与当前用户读取 | 读己之写 |
| 组合账本和订单录入 | 强一致与串行化约束 |
| Feed、榜单、搜索索引 | 最终一致，界面展示更新时间 |
| 点赞数、评论数 | 可最终一致，用户自身操作即时反馈 |
| 行情 | 以供应商和 as_of 为准，陈旧必须显式 |

## 9. 行情与金融数据设计

### 9.1 数据源治理

所有金融字段必须记录：

- provider
- 原始标识与内部 instrument_id/listing_id
- as_of 与接收时间
- 交易所时区与交易状态
- 单位、精度、币种和复权语义
- 延迟级别
- Web、App、Push、缓存、历史、衍生展示和 AI 使用权

数据负责人维护可执行的权利矩阵：

provider × 市场/字段 × 地域/用户类型 × Web/App/SSE/WebSocket/Push/分享 × 延迟级别 × 缓存/历史 × 衍生指标/AI

每个矩阵单元记录合同依据、署名要求、生效、到期、撤销、缓存清除时限和人类法务/数据负责人签核。API、缓存、实时通道、Push、分享、衍生计算和 AI 出口在返回数据前逐次校验 entitlement；未知、过期或撤销一律 fail closed。

无书面权利时，只能使用完全合成或明确授权的开发数据，并移除“实时”表述。M1 固定使用确定性 synthetic provider，不依赖任何外部行情合同。

### 9.2 行情适配层

供应商适配器只负责获取、验证、规范化和记录原始血缘；业务层只读取统一模型。每个适配器必须通过同一组 conformance tests，包括：

- 标的映射
- 交易日历
- 休市和盘前盘后
- 价格、涨跌、成交量和精度
- K 线周期
- 复权
- 币种
- 陈旧和供应商故障

每条供应商观测以 provider、listing_id、vendor_sequence、vendor_revision、event_time 及 received_at 去重排序。旧序列不得覆盖新快照；修订必须保留原始不可变观测、修订原因和生效版本。异常价格先进入隔离区，通过价格范围、交易状态、币种、精度、跳变和跨源校验后才可发布。回补与纠错通过新修订传播到快照、K 线、缓存、提醒、组合估值、衍生指标和 AI，并留下受影响对象清单。

### 9.3 降级

- 当前供应商不可用时，可降级到最近一次已知快照并显式标陈旧。
- 无授权备源时不自动切换到抓取来源。
- 授权撤销时立即停止新增出口，并按权利矩阵清除缓存、历史投影、搜索摘要和 AI 检索材料。
- 错误行情、标的串线、币种错误和未标陈旧均为 P0。

## 10. 社区、内容与治理

### 10.1 内容类型

Feed 卡片使用判别联合支持：短帖、长文、视频、新闻、7×24、指数条、热股矩阵、话题和运营卡。组合卡仅作为未来保留类型存在，首期频道注册表不得启用。

### 10.2 内容生命周期

draft → submitted → reviewing → published → limited/hidden → deleted

驳回、恢复、申诉和重新审核使用显式状态，不通过物理删除掩盖处置历史。

Moderation 只写举报、案件、证据和决定。审核 API 在模块化单体的一次数据库事务中记录决定，并通过受控模块命令让权威领域应用结果：

- Content.applyModerationDecision 更新 content_posts.status，再由 Content 发布 content.post_published、content.post_hidden 或 content.post_restored。
- Social.applyModerationDecision 更新 comment 状态，再由 Social 发布最终可见性事件。
- Identity.suspendUser 在本地 Identity 表设置 suspended，并撤销 Better Auth 本地会话，再由 Identity 发布 identity.user_suspended。

Moderation 不直接更新 Content、Social 或 Identity 表。每个受保护 API 在业务处理前同步检查本地 Identity suspended 状态，Content/Social 不依赖异步事件才停止写入。使用 Better Auth 时，本地状态与会话撤销和审核决定同事务提交；若 H0–H2 回退到外部 Keycloak，本地 deny 仍先强一致生效，外部 IdP revoke 通过 Outbox 后续执行，失败不会重新放行用户。Content、Social 或本地 Identity 命令失败时整笔审核事务回滚。

### 10.3 治理要求

- 发帖、评论、私信类能力向公网开放前必须具备举报、审核、处置、通知、申诉和复审闭环；M1 仅在双层员工准入环境中验证最小审核。
- 审核证据需保留内容快照、规则版本、操作者和时间。
- 规则集必须覆盖操纵市场、虚假或误导信息、未披露推广、利益冲突、冒充、骚扰、隐私泄漏和非法金融导流。
- 运营与审核权限分离，高风险动作采用双人复核或审计告警。
- 没有具名审核负责人、急停开关、举报、申诉和第二复审状态机时，不允许公网 UGC 发布。

### 10.4 删除、证据与保留

数据分为公开内容、账号数据、安全日志、审核证据和金融账本五类。用户删除请求先写 tombstone，再由编排任务清理活动主库投影、缓存、搜索、Feed、对象存储、AI 索引、移动端缓存和受控第三方；每个消费者写删除确认。备份恢复后必须重新播放 tombstone，防止已删数据复活。

审核证据和安全日志不与公开内容共库展示，只允许最小权限角色访问。法定留存、legal hold、匿名化、备份过期和第三方删除期限必须在 G2 由人类法务和隐私负责人签署数据保留表；在该表通过前不得进入公开发布。

## 11. 自选、提醒与模拟组合

### 11.1 自选

- 支持默认组、自定义组、排序、批量添加、市场过滤和跨端同步。
- 同一用户同一组同一 listing 不重复。
- 添加与取消使用幂等命令，离线重试不产生分叉。

### 11.2 提醒

- M1 Stretch 只支持基于规范化 last price 的上穿和下穿；涨跌幅、bid/ask、盘前盘后和复权提醒进入 M2。
- 规则保存 listing_id、比较字段、阈值、币种、允许交易时段、最大行情陈旧时间、冷却时间、最后已确认价格和最后触发序列。
- crossing 只有在连续两个合格快照分处阈值两侧时成立；陈旧、隔离、修订中或无 entitlement 的行情不触发。
- trigger 与 delivery 分离。trigger 由 rule_id + quote_revision 唯一去重；投递失败可重试但不生成第二个 trigger。
- 服务重启从持久化的最后已确认价格恢复；公司行动、参考价重置和历史修订必须重建状态或暂停规则等待用户确认。

### 11.3 模拟组合

首期只做私有模拟、手工已成交录入，不接券商账户和真实交易。

M1 Required 限定：

- 初始现金
- 单币种、长仓、无杠杆、不可卖空
- 买入、卖出和显式费用
- 冲正而非修改历史
- 负现金和负持仓拒绝
- 手工输入代表已经成交；fill price、quantity 和 occurred_at 必填
- 使用同一 as_of 的 synthetic last price 估值
- 当前盈亏等于现金 + 持仓市值 - 初始现金 - 外部净流入；M1 不计算 TWR

M2 扩展入金、出金、税费、分红、拆并股、公司行动更正、多币种、FX 时点、基准、TWR、回撤和现金流调整。

M1 必须通过借贷平衡、幂等、冲正、负余额拒绝和重放确定性的属性测试；M2 再增加公司行动只应用一次和现金流收益测试。若最小账本未完成，组合页面只能明确标成 Fixture 原型，且不计入功能完成。

M1 组合命令锁定 portfolio 聚合行，在同一 PostgreSQL 事务中校验 Idempotency-Key、余额、持仓和 version，随后追加 ledger entry 并同步更新 cash/position projection 与 aggregate version。命令响应返回 committed_version；任何投影版本低于该值时 API 返回 STATE-STALE 而非伪装最新。portfolio.ledger_entry_posted 只驱动异步估值、通知和审计，不负责建立核心现金或持仓正确性。

## 12. 搜索、推荐与 AI

### 12.1 搜索

首期索引标的、内容、用户和话题，支持代码、名称、拼音、英文和别名。搜索结果保留权限和删除过滤，删除内容不得通过索引再次出现。

### 12.2 推荐

首期“推荐”仅指内容排序，不代表证券推荐。采用可解释规则：关注关系、频道、内容新鲜度、互动质量、标的相关性、屏蔽与负反馈；不得根据个人持仓生成买卖方向。训练平台和复杂机器学习排序不进入 7 天版本。

### 12.3 AI

首期只提供一个可关闭的带来源摘要或解释用例：

- 输出显示数据和内容时点。
- 每个事实带可访问引用。
- 工具只读。
- 保存模型版本、Prompt 模板版本、去标识化检索参数哈希、引用 ID 和安全决策，不保存原始检索正文。
- 无引用、引用失效、输入越权、输出个性化买卖建议或无法通过红队时关闭入口。
- M1 AI 默认关闭且不计完成度。评测只能使用有明确评测许可的公开数据或完全合成数据，不发送持仓、私信、身份和精确设备数据。
- 原始 Prompt 与检索正文默认不落库，只保留去标识化运行元数据和引用 ID；确需调试采样时必须单独同意、限时保留和审计。
- 第三方模型必须书面承诺不训练客户数据，并明确存储地域、保留、删除和子处理方；未通过前只允许本地合成 Stub。

## 13. 开源复用策略

### 13.1 采用原则

1. 首选成熟、活跃、可维护、可替换且许可证清晰的基础设施和 UI 原语。
2. 通过适配层封装搜索、通知、实时连接、行情源和 AI，避免供应商锁死。
3. 使用 SBOM、许可证 allowlist、漏洞扫描和版本锁定。
4. 参考项目只用于理解模式，禁止复制不兼容代码。

### 13.2 分类

| 分类 | 项目或方向 | 用法 |
|---|---|---|
| 直接采用 | Next.js、Expo、React Native、NestJS、PostgreSQL、Valkey、Radix、shadcn、Playwright、OpenTelemetry | 产品基础栈；仍须锁版本和许可证 |
| 精确制品核准后封装 | Centrifugo、独立搜索引擎、通知编排、Uppy、tusd、imgproxy、Vercel AI SDK | M2 候选；逐镜像、edition、版本和传递依赖审查后才可安装 |
| 算法采用 | Riskfolio-Lib、PyPortfolioOpt | 只用于分析算法，业务账本自建 |
| 选择性迁移 | 许可证明确且通过代码审查的 MIT/Apache/BSD 模块，例如 PanWatch 的局部模式 | 保留来源、重写适配并测试 |
| 仅参考 | OpenStock、Ghostfolio、OpenBB、Stocknear，以及未核准的 mixed-license/AGPL/商业制品 | 不进入发布产物或运行时 |

最终采用前重新核验当前版本许可证、商标、传递依赖、容器、字体、图标、素材、模型和数据集。未知许可证为零。

## 14. 多代理交付模型

### 14.1 并发上限与职责

当前环境最多允许主代理加三个子代理同时工作。采用高频轮转，不把更多代码产出误认为更多可交付功能。

| 槽位 | 默认职责 |
|---|---|
| 主代理 | 契约所有者、架构、任务切片、根配置、集成、全量验证和最终修复 |
| 子代理 A | API、领域模型、数据库、行情适配和种子数据 |
| 子代理 B | Web、Web UI、浏览器测试 |
| 子代理 C | Expo/React Native、原生能力、移动测试 |

进入验证波次后，完成实现的子代理优先转为其他领域的独立验证者。独立品控有 G0–G6 否决权。

### 14.2 工作隔离

实现阶段必须使用独立 worktree/分支；共享一个目录时只允许一个写代理。

| 所有者 | 路径 |
|---|---|
| 主代理 | 根 package、lockfile、workspace、CI、Docker、packages/contracts、生成 SDK、设计 token、跨端 E2E |
| A | apps/api、packages/domain、packages/market-adapters、migrations、seed、API tests |
| B | apps/web、packages/web-ui、Web Playwright tests |
| C | apps/mobile、packages/native-ui、移动测试与构建配置 |

规则：

- 子代理不得直接修改共享契约，只提交变更建议。
- Lockfile、根配置和共享设计 token 只有主代理可写。
- 数据库迁移只有 A 创建，主代理串行集成和空库回放。
- 生成文件不得手改。
- 两个活跃代理涉及同一文件、同一业务表或同一接口的破坏性变更时，立即停止其中一个。

### 14.3 启动顺序与契约候选

- H0–H1：主代理创建最小 Monorepo、根配置、首个可构建 commit 和集成分支；子代理只做只读审查。
- H1–H4：主代理发布第一版 Contract、Fixture、Route 和 Design Token 候选；子代理准备独立任务包，不修改共享文件。
- H4 后：只有通过契约测试并生成 SDK/Fixture 的 contract SHA 才可供 Web、API、Mobile worktree 并行消费。
- H32 和 Day 6 强制释放实现槽进入独立验证；验证者不得验收自己的实现。

第一批契约候选包括：

- 核心 ID、时间、金额和错误结构。
- 游客、用户、运营、审核、管理员权限。
- Feed 卡片联合、证券摘要、行情快照、作者摘要和互动状态。
- OpenAPI、事件信封、幂等、分页。
- Web URL、App Screen、Deep Link 映射。
- Demo Fixtures。

“四小时”是候选发布时间目标，不等于 G2 已冻结。7 天内默认只允许向后兼容字段新增；破坏性变更只在每日两次集成窗口处理，并同时更新 Fixture、生成 SDK 和契约测试。只有附录的最小端点、表、事件、权限和路由通过审查后才可把 M1 契约标记为冻结。

### 14.4 波次节奏

1. 主代理发布固定 base SHA、契约版本、允许路径、反目标和验收命令。
2. 三个子代理执行 2–4 小时独立任务。
3. 每个子代理返回修改文件、实现摘要、原始测试结果、未解决风险和契约建议。
4. 主代理逐一审查和集成；主干不绿时不启动新写任务。
5. 运行契约、迁移、浏览器、移动和跨域冒烟。
6. 释放至少一个槽作为独立验证者。

待集成分支超过两个、最老等待超过半个工作日、主干未绿、消费者复制 DTO、同日出现两次破坏性契约修改或测试只能靠扩大超时通过时，停止扩功能并清理集成队列。

分支统一使用 agent/<lane>/<cap-id>，每个任务固定 base SHA。主代理在集成分支按依赖顺序 squash merge 或 cherry-pick；失败即回滚该独立 commit，不在主干直接修补未知修改。依赖新增由子代理提出申请，只有主代理可更新根 package 与 lockfile。

### 14.5 代理完成证据

子代理自报完成不构成验收。每项交付至少包含：

- commit SHA 与 base SHA
- 修改文件清单
- 完整测试命令和原始结果
- 构建、环境和数据版本
- 未解决项和风险
- 独立复核人

主代理从干净检出运行全量套件后，能力才可进入“已验证”。

## 15. 48 小时与 7 天交付

### 15.1 D0：48 小时 Demo Ready

两天版本是方向验证和可点击演示，不是生产 MVP。

D0 全部由版本化 Fixture 驱动，不承诺 API、数据库或行情供应商闭环。

Web Required 黄金路径：

种子身份进入 → 首页 Feed → 搜索标的 → 标的详情与合成 K 线 → 加自选

D0 Stretch 只允许选择一个：A）本地短帖与评论交互；B）明确标为 Fixture 的只读私有组合卡。Stretch 不计 D0 通过。

App Required 为可启动导航壳，并使用同一 Fixture Schema 完成首页、搜索、标的详情和加自选四个页面；不宣称 App MVP。

量化退出条件：

- Demo Scope 的需求、页面和触点追踪率 100%。
- 范围内无死按钮；未实现入口隐藏或明确标记原型。
- 核心页具备正常、加载、空和错误状态。
- Web 可启动；App 在本机已安装相应工具链时完成 iOS Simulator 和 Android Emulator 启动，缺失工具链时保存 Expo Web/预构建证据并列为环境阻塞，不冒充真机通过。
- 类型检查、Lint、Build 无阻断错误。
- Web 黄金路径有 Playwright 证据。
- 不使用生产密钥、真实个人数据、逆向接口和未授权实时行情。
- 数据显示来源、时点或“演示数据”。
- 范围内 P0/P1 为零。

### 15.2 M1：7 天 Vertical Alpha Ready

七天版本是员工可见、合成数据驱动的纵向集成试验，不是可用 MVP、公开 Beta 或商店版本。七天计时从 G0 关键数据/合规边界确认、G1 规格批准、仓库权限和本地工具链可用之后开始；Monorepo 与 M1 契约候选计入 Day 1。H4 仍未产出可生成 SDK 的契约候选时，里程碑自动进入风险状态而不是让客户端猜字段。

M1 Staging 同时使用边缘 Zero Trust/VPN 与 API 邀请名单或 employee claim 双层封闭。公开注册关闭；/v1/auth/register 必须携带一次性邀请或受信企业身份。API 表中的 Guest/Public 仅表示“已经通过 Alpha 环境准入后暂无业务会话/无需资源级权限”，不代表互联网公开。

共享核心链：

注册/登录 → 搜索标的 → 查看详情 → 加自选 → 发布短讨论 → 评论/点赞 → 收到消息 → 返回原内容

Required：

1. 登录和安全会话。
2. 规则 Feed。
3. 短帖、评论和点赞。
4. 基于确定性 synthetic provider 的标的搜索、详情和行情图表。
5. 自选和跨端同步。
6. 单币种、长仓、无杠杆的手工已成交模拟组合最小账本。
7. 数据库站内 Inbox；不含 APNS/FCM。
8. 举报、隐藏、恢复、封禁和审计的最小审核后台。

Stretch，不计 M1 通过：

- 价格提醒。
- 关注、收藏及其完整异常状态。
- AI 摘要；默认关闭。
- 外部 Push、完整申诉、复杂搜索排序和媒体上传。
- 公司行动、多币种、基准、TWR、回撤和外部现金流。

日程：

| 日期 | 可运行增量 |
|---|---|
| Day 1 | Monorepo、设计 token、OpenAPI、数据库、Fixture、导航壳 |
| Day 2 | Web 黄金路径、App 壳、基础 API 和 Seed |
| Day 3 | 最小审核状态机与 Admin 骨架先行；App 登录、Feed、标的详情、自选 |
| Day 4 | 经过审核状态机的三端短帖评论与最小模拟组合账本 |
| Day 5 | 数据库 Inbox、举报、审核、审计；Stretch 只在 Required 全绿后开始 |
| Day 6 | 功能冻结；契约、迁移、浏览器、模拟器、可用真机、弱网、权限和定向安全验证 |
| Day 7 | 只修阻塞缺陷；生成构建、测试、演示和差距证据 |

退出条件：

- Web、iOS、Android 使用同一 API、数据库和领域 ID 完成共享核心链。
- 同一账号在三端看到一致的自选、帖子、评论和组合。
- 所有 mutation 幂等，断网重试不产生重复数据。
- 登录过期、无权限、弱网、失败和审核状态可演示。
- 附录列出的全部 M1 端点通过契约测试；附录列出的全部 mutation 通过幂等或明确的条件更新测试。
- 必测安全用例为认证绕过、水平越权、存储型/反射型 XSS、CSRF、请求体大小、内容长度和接口限流；媒体上传不在 Required。
- Gitleaks、Semgrep、Syft 和 Grype/Trivy 生成原始报告；生产 Secret、未知直接依赖许可证和可利用 Critical/High 漏洞为零，误报必须有人类签字与证据。
- 关键 Web/App E2E 全通过。
- 从版本化 PostgreSQL dump 恢复到空实例，校验迁移版本、关键表行数、账本重放和黄金旅程；同时完成内容下架和功能开关关闭演练。
- Alpha Required 范围 P0/P1 为零。
- 内部 Alpha 不开放公网 UGC，并保存环境访问控制证据。

### 15.3 时间边界

- 两天只能承诺 Demo Ready。
- 一周只能承诺内部 Vertical Alpha Ready。
- 48 小时或 7 天都不能证明行情授权、全面安全、容量、灾备、审核运营和真实开收盘周期稳定性。
- 代理数量不能替代数据合同、法务结论、Apple 证书、推送凭证、真实设备、内容运营和生产值守。

## 16. 长期高完整度路线

| 阶段 | 目标 | 现实时间 |
|---|---|---|
| D0 | 48 小时 Web 演示 + App 导航壳 | 2 天 |
| M1 | Web/iOS/Android 员工纵向 Alpha | G0/G1 与环境就绪后 7 天 |
| M2 | 受控 MVP：真实授权数据、审核后台、安全与真机覆盖 | 数据合同与审批完成后 6–8 周规划假设 |
| V1 | 可公开 Web/App v1，核心社区、行情、自选、组合和运营稳定 | 4–6 个月 |
| HC | 高完整度，多市场、推荐、消息、治理、灾备和运营成熟 | 9–12 个月以上 |

M2 之后的时间假设有产品、设计、前后端、移动、数据、测试、运维、合规和运营组成的 10 人以上真实团队。只有主代理和三个子代理时可以显著加速编码、调研和验证，但不能压缩所有外部依赖。

长期采用以下依赖 DAG：

1. G0 数据权利、品牌和资质；G1 页面、状态、角色和合规处置。
2. Identity + Instrument Reference + 交易日历 + entitlement。
3. Market Data 规范化、纠错、修订和 synthetic/授权适配。
4. Content 状态机 + 最小 Moderation/Admin + 审计；完成后只允许内部 Alpha Social。
5. Feed + Channel Registry + 规则排序。
6. Watchlist 在 Identity/Instrument 后独立建设；Notification Inbox 必须先于事实型 Alerts 和互动通知。
7. 私有 Portfolio Ledger，然后接入一致 as_of 的估值与 Analytics。
8. Search、全频道、频道管理与运营注入。
9. 完整申诉与第二复审通过后才允许公网 UGC；随后建设 Messaging 和外部 Push。
10. AI + Recommendation；前提是权限、来源、引用、数据处理条款和评测闭环已通过。
11. 性能、可访问性、灾备、发布和供应商降级。

每个波次必须同时产出 API、Web、App、运营能力和证据，不采用“后端全做完再做 Web，最后补 App”的瀑布方式。

## 17. 质量门禁

### 17.1 G0–G6

| 门禁 | 通过条件 |
|---|---|
| G0 参考基线 | 参考版本、范围、品牌、资质、数据和许可证边界冻结 |
| G1 规格冻结 | 功能树、页面地图、状态、旅程、后台能力和未知项通过 |
| G2 契约冻结 | API、事件、表所有权、数据血缘、权限、测试和性能预算通过 |
| G3 纵向验证 | Web/App/API/数据库真实闭环通过，不依赖各端独立 Fixture |
| G4 功能完成 | 首期能力、自动化、人工、视觉和运营验收通过 |
| G5 发布候选 | 安全、性能、可访问性、恢复、AI 红队、授权和兼容通过 |
| G6 生产发布 | Go/No-Go、Canary、监控、回滚、值班和供应商状态就绪 |

独立品控可否决任一门禁。P0 不允许豁免；P1 不得进入公开发布。

### 17.2 质量维度

| 维度 | 核心标准 |
|---|---|
| 页面与状态 | 每页登记入口、出口、权限、路由、Screen、Deep Link 和全部适用状态 |
| Web/App 一致性 | 共享能力 100% 映射；差异必须有平台理由和批准记录 |
| API | 公开 API 100% 进入 OpenAPI；mutation 有鉴权、幂等和冲突规则 |
| 数据血缘 | 金融字段 100% 可追溯到来源、转换、单位、精度、币种、时区、延迟和授权 |
| 权限 | Actor × Resource × Action 正反测试；默认拒绝 |
| 许可证 | 代码、依赖、容器、字体、图标、素材、模型和数据集识别率 100% |
| E2E | 关键旅程和负向路径通过，不用代码覆盖率替代需求覆盖 |
| 视觉 | 支持断点和设备有批准基线；未审核差异为零 |
| 性能 | 指定设备、网络和数据量有预算；Web Core Web Vitals 以 p75 良好为基础 |
| 可访问性 | WCAG 2.2 AA；Web 键盘/读屏，App VoiceOver/TalkBack 人工验证 |
| 运维 | 健康检查、日志、Trace、告警、熔断、备份、恢复、回滚和值班演练 |

### 17.3 缺陷等级

- P0：错误金融数据、账本损坏、隐私或密钥泄漏、越权、持牌红区可达、无法恢复或大面积不可用。
- P1：关键旅程断裂、跨端结果不一致、内容无法下架、草稿无法恢复、关键无障碍障碍。
- P2：有替代路径的次要状态、兼容性、性能或无障碍问题。
- P3：不影响任务完成的视觉和文案瑕疵。

### 17.4 证据格式

每份证据必须包含：

Commit/Build｜环境｜时间｜完整命令和配置｜Fixture/数据版本｜通过/失败数量｜原始报告｜复核人

代码、配置、模型、Prompt、数据商或依赖版本变化后，相关证据自动失效。

## 18. 关键风险与停止条件

| 风险 | 防线 | 停止条件 |
|---|---|---|
| 共享写冲突 | 独立 worktree、路径所有权、single writer | 两个活跃代理写同一文件、表或共享契约 |
| 伪并行 | 依赖 DAG、契约版本、任务输入冻结 | 消费者需要猜字段或自行复制实体 |
| 集成拥堵 | 小批次、单个集成 owner、主干全绿 | 待集成超过两项或等待超过半天 |
| 页面假完整 | 能力追踪链和服务端状态 | 无 E2E 或无异常状态仍继续铺页面 |
| 行情越权 | 数据源 allowlist 和用途授权 | 出现未批准域名或无展示权 |
| 资质偷渡 | 服务端 deny-list，不只隐藏按钮 | 出现交易、申赎、跟投、个性化建议命令 |
| 组合假完成 | 追加式账本、属性测试、确定性重放 | 余额可直接编辑或重放结果不一致 |
| 社区无治理 | 举报到申诉闭环和急停 | 无审核负责人或无处置状态机 |
| Mock 全绿 | 适配器契约、真实数据库、Staging E2E | blanket mock、跳过测试或只靠扩大 timeout |
| OSS 污染 | SBOM 和许可证 allowlist | 未批准 copyleft 或未知许可证进入构建 |
| AI 风险 | 引用、只读工具、版本记录和 Feature Flag | 无引用、越权数据或买卖仓位输出 |
| Secret/外部副作用 | 临时环境、禁止生产凭据、出网审计 | 代理接触真实用户、真实 Push/SMS 或提交 Secret |

## 19. 可执行验收总则

正式开始实现前，主代理将基于本规格编写逐任务开发计划。每个任务必须包含：

- 目标与反目标
- 依赖和 contract SHA
- 可修改与禁止修改路径
- 数据 Fixture
- 验收命令
- 安全、许可证和资质限制
- 完成证据

项目每周输出能力总账、Web/App 映射、质量门禁状态、P0/P1、数据权利状态和未完成清单。对外汇报必须使用正确的交付名称，不把 Demo Ready、Vertical Alpha Ready、MVP、Beta 和 Production 混用。

## 20. 已确定决策

1. Web 先行，但 App 从第一天保留真实工程和接口，不作为事后 WebView 补丁。
2. 业务核心采用模块化单体；行情、AI、异步任务和实时通道独立。
3. 契约优先、生成 SDK、单表单写者、Outbox/Inbox 和明确一致性。
4. 首期使用规则推荐、手工模拟组合和延迟/演示行情。
5. 持牌交易、基金销售、开户、跟投和个性化投顾全部隔离。
6. 开源项目优先复用基础设施和原语，受限项目只参考。
7. 多代理采用独立 worktree、严格路径所有权、2–4 小时波次和独立品控轮转。
8. 48 小时目标为 Demo Ready；7 天目标为员工可见的 Vertical Alpha Ready；长期目标按 G0–G6 提升至高完整度。

## 21. D0/M1 能力总账

下表是第一版可计算范围。Required 能力已有最小契约，标记“已设计”；Stretch 只有方向与边界，标记“已发现”；禁用能力标记“隔离已设计”。尚无能力进入实现或验证。

| CAP ID | 能力 | D0 | M1 | Web/App/API/Admin | 合规处置 | 状态 |
|---|---|---|---|---|---|---|
| CAP-ID-001 | 种子身份/真实会话 | Required Fixture | Required | W/A/API | Allowed | 已设计 |
| CAP-INST-001 | 标的搜索与详情 | Required Fixture | Required | W/A/API | Allowed with data gate | 已设计 |
| CAP-MD-001 | 报价与 K 线 | Required Synthetic | Required Synthetic | W/A/API | Allowed with as_of | 已设计 |
| CAP-FEED-001 | 规则 Feed | Required Fixture | Required | W/A/API | Allowed internal only | 已设计 |
| CAP-WATCH-001 | 加减自选与同步 | Required Fixture | Required | W/A/API | Allowed | 已设计 |
| CAP-CONTENT-001 | 短帖创建与详情 | Out | Required | W/A/API/Admin | Allowed internal only | 已设计 |
| CAP-SOCIAL-001 | 评论与点赞 | Out | Required | W/A/API/Admin | Allowed internal only | 已设计 |
| CAP-NOTIF-001 | 数据库站内 Inbox | Out | Required | W/A/API | Allowed | 已设计 |
| CAP-MOD-001 | 举报、隐藏、恢复、封禁、审计 | Out | Required before UGC | W/API/Admin | Required control | 已设计 |
| CAP-PORT-001 | 私有单币种模拟账本 | Stretch Fixture | Required | W/A/API | Allowed private only | 已设计 |
| CAP-ALERT-001 | last price 穿越提醒 | Out | Stretch | W/A/API | Allowed factual only | 已发现 |
| CAP-FOLLOW-001 | 关注与收藏 | Out | Stretch | W/A/API/Admin | Allowed | 已发现 |
| CAP-AI-001 | 有来源摘要 | Out | Stretch Off | W/A/API/Admin | FeatureFlagOff | 已发现 |
| CAP-PUSH-001 | APNS/FCM | Out | Out | A/API/Admin | M2 | 已发现 |
| CAP-PUBLIC-PORT-001 | 组合排行、播报、复制 | Out | Out | None | FeatureFlagOff | 隔离已设计 |
| CAP-PRIVATE-FUND-001 | 私募产品与认购 | Out | Out | None | LicensedOnly | 隔离已设计 |

D0 Required 只计算 CAP-ID-001、CAP-INST-001、CAP-MD-001、CAP-FEED-001、CAP-WATCH-001 的 Fixture 演示。M1 Required 只计算表中明确标记 Required 的能力；Stretch 不影响通过。

### 21.1 Required 能力追踪映射

| CAP ID | PAGE | TOUCH | API | EVENT | DATA | TEST/EVIDENCE |
|---|---|---|---|---|---|---|
| CAP-ID-001 | PAGE-AUTH-001 | 登录/退出 | API-AUTH-001..004 | identity.user_registered、identity.user_suspended | identity_*、auth_* | 会话、邀请、撤销、跨账号 E2E |
| CAP-INST-001 | PAGE-SEARCH-001、PAGE-INST-001 | TOUCH-SEARCH-001 | API-INST-001..002 | None | instruments、listings、exchanges | 搜索黄金样例、市场/币种对账 |
| CAP-MD-001 | PAGE-INST-001 | 周期切换 | API-MD-001..002 | market.quote_revised | market_* | as_of、陈旧、序列/修订契约 |
| CAP-FEED-001 | PAGE-HOME-001 | 分页、刷新 | API-FEED-001 | content.post_published/hidden/restored | feed_channels、feed_items | 卡片联合、删除传播、浏览器 E2E |
| CAP-WATCH-001 | PAGE-WATCH-001、PAGE-INST-001 | TOUCH-WATCH-001 | API-WATCH-001..003 | watchlist.item_changed | watchlists、watchlist_items | 幂等、读己之写、三端同步 |
| CAP-CONTENT-001 | PAGE-COMPOSE-001、PAGE-POST-001 | TOUCH-POST-001 | API-POST-001..002 | content.post_submitted/published | content_posts、revisions | 草稿恢复、审核状态、XSS、E2E |
| CAP-SOCIAL-001 | PAGE-POST-001 | TOUCH-COMMENT-001、TOUCH-REACTION-001 | API-COMMENT-000..001、API-REACTION-001..002 | social.comment_submitted/published/hidden/restored、reaction_changed | social_comments、reactions | 幂等、权限、审核可见性、viewer_reaction |
| CAP-NOTIF-001 | PAGE-NOTIF-001 | TOUCH-NOTIF-001 | API-NOTIF-001..003 | notification.created/read_watermark_advanced | notifications、read_state | recipient、单调已读、SSE 恢复、失效深链 |
| CAP-MOD-001 | PAGE-MOD-001 | TOUCH-REPORT-001、TOUCH-MOD-001 | API-REPORT-001、API-MOD-001..002 | moderation.report_submitted、moderation.decision_recorded、content.post_published/hidden/restored、identity.user_suspended | moderation_* | 决定事务、下架、恢复、封禁回归 |
| CAP-PORT-001 | PAGE-PORT-LIST-001、PAGE-PORT-001 | TOUCH-PORT-001..002 | API-PORT-000..006 | portfolio.ledger_entry_posted | portfolio_* | 列表发现、账本分页、属性测试、版本、重放、三端一致 |

## 22. 页面、状态与触点注册表

### 22.1 Route / Screen / Deep Link

| PAGE ID | 能力 | Web Route | App Screen | Deep Link | D0/M1 |
|---|---|---|---|---|---|
| PAGE-AUTH-001 | 登录 | /login | /(auth)/sign-in | huoqiu://login | D0 Fixture / M1 |
| PAGE-HOME-001 | 首页 Feed | / | /(tabs)/home | huoqiu://home | D0/M1 |
| PAGE-SEARCH-001 | 搜索 | /search?q= | /search | huoqiu://search?q= | D0/M1 |
| PAGE-INST-001 | 标的详情 | /instruments/[listingId] | /instrument/[listingId] | huoqiu://instrument/:listingId | D0/M1 |
| PAGE-WATCH-001 | 自选 | /watchlist | /(tabs)/watchlist | huoqiu://watchlist | D0/M1 |
| PAGE-COMPOSE-001 | 发布短帖 | /compose | /compose | huoqiu://compose | M1 |
| PAGE-POST-001 | 帖子详情 | /posts/[postId] | /post/[postId] | huoqiu://post/:postId | M1 |
| PAGE-NOTIF-001 | 站内消息 | /notifications | /notifications | huoqiu://notifications | M1 |
| PAGE-PORT-LIST-001 | 私有组合列表 | /portfolios | /(tabs)/portfolio | huoqiu://portfolios | M1 |
| PAGE-PORT-001 | 私有组合 | /portfolios/[portfolioId] | /portfolio/[portfolioId] | huoqiu://portfolio/:portfolioId | M1 |
| PAGE-MOD-001 | 审核队列 | /admin/moderation | None | None | M1 Admin |

App Deep Link 落地后必须重新鉴权，不能仅依赖链接中携带的 ID。

### 22.2 标准状态

| STATE ID | 状态 | 适用规则 |
|---|---|---|
| STATE-LOAD | 加载 | 所有数据页 |
| STATE-EMPTY | 空 | Feed、自选、搜索、通知、组合 |
| STATE-ERROR | 可恢复错误 | 所有网络读取 |
| STATE-OFFLINE | 离线 | App 与可安装 Web |
| STATE-STALE | 陈旧 | 行情、Feed 投影、组合估值 |
| STATE-UNAUTH | 未登录/会话过期 | 所有用户数据和 mutation |
| STATE-FORBIDDEN | 无权限/资质不可达 | 审核、他人私有组合、持牌能力 |
| STATE-CONFLICT | 版本或幂等冲突 | 编辑、反应、账本、审核 |
| STATE-REVIEW | 审核中/受限 | 帖子和评论 |
| STATE-DELETED | 已删除/已下架 | 内容、通知深链 |
| STATE-SUCCESS | 成功与可撤销反馈 | 自选、互动、审核和组合录入 |

D0 Required 页面至少实现 STATE-LOAD、STATE-EMPTY、STATE-ERROR 和正常态。M1 每个页面实现全部适用状态；N/A 必须在能力总账中写出理由。

### 22.3 M1 关键触点

| TOUCH ID | 操作 | 前置条件 | 失败恢复 | 最终状态 |
|---|---|---|---|---|
| TOUCH-SEARCH-001 | 提交搜索 | 查询已规范化 | 保留输入并重试 | PAGE-SEARCH-001 结果 |
| TOUCH-WATCH-001 | 加/减自选 | 已登录、listing 可见 | 幂等重放、乐观回滚 | 自选与详情一致 |
| TOUCH-POST-001 | 创建短帖 | 已登录、内容通过校验 | 保留本地草稿 | STATE-REVIEW 或 published |
| TOUCH-COMMENT-001 | 创建评论 | 内容可评论 | 幂等重放、保留输入 | 评论列表包含唯一评论 |
| TOUCH-REACTION-001 | 点赞切换 | 内容可见 | 条件更新与回滚 | 自身状态即时、计数最终一致 |
| TOUCH-NOTIF-001 | 打开通知 | recipient 匹配 | 对象失效时显示 STATE-DELETED | 已读 watermark 前进 |
| TOUCH-REPORT-001 | 举报内容 | 内容可见 | 重复举报合并 | 唯一 report/case |
| TOUCH-MOD-001 | 隐藏/恢复 | 审核角色、版本匹配 | STATE-CONFLICT 后刷新 | Feed/Search 同步处置 |
| TOUCH-PORT-001 | 录入模拟成交 | 本人、余额和持仓有效 | 幂等重放或拒绝 | 账本、现金、持仓同版本 |
| TOUCH-PORT-002 | 冲正账本条目 | 本人、原条目可冲正 | 拒绝重复冲正 | 新冲正条目，不改历史 |

## 23. M1 API 与错误契约目录

所有 POST 命令要求 Idempotency-Key；PUT/DELETE 使用确定资源键或 If-Match。响应包含 request_id 和 trace_id。

| API ID | Method & Path | 权限 | 关键语义 |
|---|---|---|---|
| API-AUTH-001 | POST /v1/auth/register | Invited Guest | M1 公开注册关闭；校验一次性邀请/employee claim 后创建 identity、app user 与 Profile |
| API-AUTH-002 | POST /v1/auth/login | Guest | 建立 HttpOnly Web session / App secure token |
| API-AUTH-003 | GET /v1/auth/session | User | 返回 actor、roles、consent version |
| API-AUTH-004 | POST /v1/auth/logout | User | 撤销会话与当前设备绑定 |
| API-INST-001 | GET /v1/instruments/search | Public | cursor；名称、代码、拼音和别名 |
| API-INST-002 | GET /v1/listings/:id | Public | 标的、市场、币种和交易状态 |
| API-MD-001 | GET /v1/listings/:id/quote | Public | synthetic source、as_of、stale、entitlement |
| API-MD-002 | GET /v1/listings/:id/bars | Public | interval、复权语义、cursor |
| API-FEED-001 | GET /v1/feed | Public | channel、cursor、判别联合卡片 |
| API-WATCH-001 | GET /v1/me/watchlist | User | M1 仅默认列表；事务内幂等 ensure default；读己之写 |
| API-WATCH-002 | PUT /v1/me/watchlist/items/:listingId | User | 同一事务 ensure default 并幂等添加，不能依赖注册事件时序 |
| API-WATCH-003 | DELETE /v1/me/watchlist/items/:listingId | User | 幂等删除 |
| API-POST-001 | POST /v1/posts | User | 创建短帖，默认进入审核状态 |
| API-POST-002 | GET /v1/posts/:id | Public/Owner | 依据状态与权限返回 |
| API-COMMENT-000 | GET /v1/posts/:id/comments | Public/Owner | cursor；隐藏内容不可见；返回 viewer_reaction |
| API-COMMENT-001 | POST /v1/posts/:id/comments | User | 幂等评论；返回 reviewing，审核后才对他人可见 |
| API-REACTION-001 | PUT /v1/posts/:id/reactions/like | User | 确定资源键 |
| API-REACTION-002 | DELETE /v1/posts/:id/reactions/like | User | 幂等取消 |
| API-NOTIF-001 | GET /v1/me/notifications | User | recipient 过滤、cursor |
| API-NOTIF-002 | POST /v1/me/notifications/read-watermark | User | 单调递增 |
| API-NOTIF-003 | GET /v1/me/events | User | text/event-stream；Cookie/Bearer 鉴权；Last-Event-ID 或 cursor 恢复 |
| API-REPORT-001 | POST /v1/reports | User | Moderation 单写；重复合并 |
| API-MOD-001 | GET /v1/admin/moderation/cases | Reviewer | 版本、队列、证据摘要 |
| API-MOD-002 | POST /v1/admin/moderation/cases/:id/decisions | Reviewer | If-Match；approve/reject/hide/restore/ban |
| API-PORT-000 | GET /v1/me/portfolios | User | cursor；跨端发现本人组合 |
| API-PORT-001 | POST /v1/portfolios | User | 创建本人私有组合 |
| API-PORT-002 | GET /v1/portfolios/:id | Owner | 私有资源，默认拒绝他人 |
| API-PORT-003 | POST /v1/portfolios/:id/ledger-entries | Owner | 买/卖/费用；校验余额持仓 |
| API-PORT-004 | POST /v1/portfolios/:id/reversals | Owner | 新建冲正，不改原条目 |
| API-PORT-005 | GET /v1/portfolios/:id/positions | Owner | 指定 valuation_as_of |
| API-PORT-006 | GET /v1/portfolios/:id/ledger-entries | Owner | cursor；返回可冲正状态和 committed_version |

统一错误码：AUTH_REQUIRED、SESSION_EXPIRED、FORBIDDEN、NOT_FOUND、VALIDATION_FAILED、CONFLICT、RATE_LIMITED、DATA_STALE、DATA_UNAVAILABLE、ENTITLEMENT_DENIED、CONTENT_UNAVAILABLE、LEDGER_INVARIANT_FAILED、STREAM_CURSOR_EXPIRED。

M1 SSE 只承载站内通知。event id 使用可持久恢复的 notification sequence，每 20 秒发送 heartbeat；重连携带 Last-Event-ID。游标已过恢复窗口时返回 STREAM_CURSOR_EXPIRED，客户端改用 API-NOTIF-001 全量增量同步后重新订阅。登出、封禁或 recipient 不匹配立即关闭连接。

Feed Card v1 的公共字段为 type、schema_version、card_id、published_at、source、permissions 和 payload；payload 按 post、news、market_strip、topic、ops_banner 判别。未知 type 必须安全跳过并记录遥测。

## 24. M1 事件目录

| EVENT ID / v1 | 生产者 | 消费者 | 作用 |
|---|---|---|---|
| identity.user_registered | Identity | Watchlist、Operations | Identity 已在注册事务创建 Profile；Watchlist 可预建默认列表但读写接口仍事务内 ensure，Operations 记审计 |
| content.post_submitted | Content | Moderation | 创建审核案件 |
| moderation.decision_recorded | Moderation | Operations | 管理动作审计；权威状态由同步模块命令应用 |
| content.post_published | Content | Feed、Search、Notification | 建立公开投影 |
| content.post_hidden | Content | Feed、Search、Notification | 删除公开投影并通知作者 |
| content.post_restored | Content | Feed、Search、Notification | 恢复允许的公开投影 |
| identity.user_suspended | Identity | Content、Social、Notification、Operations | 新写入已由同步 auth guard 阻断；事件仅更新可见性、通知和审计投影 |
| social.comment_submitted | Social | Moderation | 创建评论审核案件 |
| social.comment_published | Social | Notification、Feed | 互动通知与计数投影 |
| social.comment_hidden | Social | Notification、Feed、Search | 删除评论投影 |
| social.comment_restored | Social | Notification、Feed、Search | 恢复允许的评论投影 |
| social.reaction_changed | Social | Notification、Feed | 点赞通知与计数投影 |
| watchlist.item_changed | Watchlist | Feed、Operations | 自选同步和审计 |
| notification.created | Notification | SSE | 建立 recipient Inbox |
| notification.read_watermark_advanced | Notification | Operations | 已读审计 |
| moderation.report_submitted | Moderation | Moderation queue | 报告入队 |
| portfolio.ledger_entry_posted | Portfolio | Valuation、Notification、Operations | 核心现金/持仓已同事务提交；异步重估、通知和审计 |
| market.quote_revised | Market Data | Portfolio、Alert Stretch | 重估或重新判断 crossing |

所有事件使用第 8.3 节信封。Search、Feed、Notification 和 Portfolio consumer 保存 Inbox receipt；重复 event_id 不得产生第二次副作用。

## 25. 物理表所有权候选

| 领域 | M1 owned tables | 关键约束 |
|---|---|---|
| Identity | identity_users、identity_profiles；auth_accounts/auth_sessions/auth_verifications 为 Better Auth 私有表 | email 规范化唯一；其他域只引用 identity_users.id，不连接 Auth 私表 |
| Instrument Reference | instruments、listings、exchanges、exchange_calendars | market+symbol 唯一；listing 指向 instrument；公司行动表 M2 |
| Market Data | market_observations、market_quotes、market_bars、market_entitlement_projection | provider+listing+sequence+revision 唯一；旧版本不可覆盖新版本 |
| Content | content_posts、content_post_revisions | author+client_request_id 唯一；status/version |
| Social | social_comments、social_reactions、social_follows、social_bookmarks、social_blocks | reaction actor+target+type 唯一；comment status/version |
| Moderation | moderation_reports、moderation_cases、moderation_evidence、moderation_decisions、moderation_appeals、moderation_audit | target+reporter+reason 合并；decision 追加；evidence 受限 |
| Feed & Channel | feed_channels、feed_items、feed_ranking_snapshots | channel+source_event 唯一；只存投影 |
| Watchlist | watchlists、watchlist_items | M1 每个 owner 一个 default 列表；list+listing 唯一；自定义列表 M2 |
| Notification | notifications、notification_read_state、notification_delivery_attempts | recipient+canonical_key 唯一；watermark 单调 |
| Portfolio | portfolios、portfolio_ledger_entries、portfolio_position_projection、portfolio_valuation_snapshots | owner 私有；client_request_id 唯一；ledger 追加且可冲正 |
| Platform Events | outbox_events、inbox_receipts | event_id 唯一；consumer+event 唯一 |

所有可变聚合含 version bigint；所有表含 created_at，适用表含 updated_at 与 deleted_at。Moderation API 在同一领域事务内写 report 与 case；Social 不写举报表。Operations 只消费跨系统管理事件生成 system admin audit，不修改 Moderation 的证据或决定。

## 26. Actor × Resource × Action 权限候选

符号：A 允许，I 仅受邀 Alpha Guest，O 仅本人，R 审核角色，M 系统管理员，— 默认拒绝。

| Action | Guest | User | Creator | Operator | Reviewer | Admin |
|---|---:|---:|---:|---:|---:|---:|
| 受邀注册 | I | — | — | — | — | — |
| 登录、查询或注销自己的会话 | A | O | O | O | O | O |
| 浏览已发布公开内容/合成行情 | A | A | A | A | A | A |
| 搜索公开标的 | A | A | A | A | A | A |
| 管理自选 | — | O | O | O | O | O |
| 创建短帖/评论/点赞 | — | O | O | O | O | O |
| 编辑或删除自己的草稿 | — | O | O | O | O | O |
| 读取自己的 Inbox/SSE 与推进已读 | — | O | O | O | O | O |
| 查看/写入私有组合 | — | O | O | O | O | O |
| 查看他人私有组合 | — | — | — | — | — | — |
| 举报公开内容 | — | A | A | A | A | A |
| 查看审核证据 | — | — | — | — | R | M |
| approve/reject/hide/restore/ban | — | — | — | — | R | M |
| 配置频道与运营位 | — | — | — | A | — | M |
| 开启持牌能力或公开组合 | — | — | — | — | — | — |

每个 API 必须在 OpenAPI 中引用本矩阵的 Action；没有映射 Action 的 API 默认拒绝。Operator 不能修改审核决定；Reviewer 不能修改运营排序。

M1 的 Guest 仍须先通过员工环境边缘准入；Invited Guest 还须通过一次性邀请或企业身份校验才能注册。外部互联网请求在到达业务权限矩阵前即被拒绝，API 层再次验证 alpha_access claim。

## 27. 频道与卡片白名单

M1 Channel Registry 只允许 home、following、market 和 news。strategy_research 在数据与合规审查后只读开启；private_fund、public_portfolio 和 trade 均不注册。

M1 Card Registry 只允许 post、news、market_strip、topic 和 ops_banner。每种卡片必须绑定 schema_version、Web component、App component、允许频道、权限、数据来源、Fixture 和视觉基线。运营后台只能选择白名单卡片与结构化字段，禁止注入任意 HTML、脚本或未知 Deep Link。

能力总账中所有 Out、FeatureFlagOff、LicensedOnly 和 Forbidden 项在 D0/M1 不得出现在导航、搜索联想、Deep Link 注册、API Schema 或可点击按钮中；如为解释参考截图而展示，只能作为明确标注且不可交互的设计注释，不进入运行构建。

## 28. Gate 与证据现状

| Gate | 当前状态 | 尚缺证据 |
|---|---|---|
| G0 | 部分满足 | 将用户截图归档为稳定证据、记录参考产品版本；数据与法务负责人签署权利/合规矩阵 |
| G1 | 候选 | 产品负责人批准本规格；逐页视觉基线和完整状态矩阵在计划中实例化 |
| G2 | 未通过 | 生成实际 OpenAPI、DDL、Event Schema、Fixture、性能预算和 contract tests |
| G3 | 未开始 | 三端纵向 Alpha 尚未实现 |
| G4 | 未开始 | 首期能力未实现 |
| G5 | 未开始 | 数据授权、安全、性能、无障碍、恢复和 AI 红队未完成 |
| G6 | 未开始 | Canary、监控、回滚、值班与生产签字未完成 |

G2 候选性能预算将在实施计划中绑定固定数据量与环境，至少覆盖 API p95/p99、Feed 首屏、搜索、SSE 通知、synthetic quote 新鲜度、提醒延迟、数据库恢复 RPO/RTO 和移动冷启动。没有数值、环境和原始报告时不得宣称 G2 通过。

### 28.1 参考截图索引

| REF ID | 用户提供的参考批次 | 覆盖 |
|---|---|---|
| REF-APP-HOME-001 | 首张 App 首页 | 顶部搜索、频道、空关注、底部导航 |
| REF-APP-TABS-001 | 自选、基金、策略/私募参考、我的 | App 一级页与业务入口 |
| REF-APP-MARKET-001 | 行情与组合两页 | 行情总览、组合概况与卡片 |
| REF-APP-CHANNEL-001 | 推荐、热门、视频、自选、基金、资讯、达人、ETF、频道管理 | Feed 卡片、频道排序和内容密度 |
| REF-WEB-HOME-001 | 八张 Web 页面 | 三栏框架、频道 Feed、榜单侧栏 |
| REF-APP-DETAIL-001 | 标的详情、长文、搜索、发布、消息、设置、组合十七张 | 详情子页、创作、消息、设置和组合交互 |

以上截图目前仅存在于本次会话附件；进入 G0 完成态前必须在得到用户授权后归档原图、哈希、采集日期、平台版本和观察备注。
