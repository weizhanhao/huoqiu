export type HomeTopic = Readonly<{
  id: string;
  impact: readonly Readonly<{
    change: string;
    direction: "down" | "up";
    name: string;
  }>[];
  rankLabel: string;
  summary: string;
  title: string;
}>;

export const homeTopics: readonly HomeTopic[] = [
  {
    id: "cpo-rally",
    impact: [
      { change: "+2.18%", direction: "up", name: "通信设备" },
      { change: "+1.46%", direction: "up", name: "光通信" },
    ],
    rankLabel: "雪球热点 NO.1",
    summary:
      "CPO 概念盘中走强，市场关注高速光模块、交换芯片和数据中心资本开支。短线价格波动之外，订单兑现与量产节奏仍是观察重点。",
    title: "CPO概念拉升，天孚通信大涨",
  },
  {
    id: "gold-etf",
    impact: [
      { change: "+0.83%", direction: "up", name: "贵金属" },
      { change: "+0.52%", direction: "up", name: "黄金ETF" },
    ],
    rankLabel: "雪球热点 NO.2",
    summary:
      "利率预期变化推动贵金属重新获得关注，亚洲主要黄金 ETF 出现资金净流入。后续仍需结合美元指数与实际利率共同判断。",
    title: "加息再降温！亚洲最大黄金ETF七月以来首次净流入",
  },
  {
    id: "cro-rise",
    impact: [
      { change: "+1.91%", direction: "up", name: "医疗服务" },
      { change: "+1.32%", direction: "up", name: "生物科技" },
    ],
    rankLabel: "雪球热点 NO.3",
    summary:
      "CRO 板块延续活跃，公开信息显示部分企业新增订单有所改善。判断行业修复质量时，应继续跟踪在手订单、人员利用率和现金流。",
    title: "CRO概念持续走高，南模生物涨停",
  },
  {
    id: "food-beverage",
    impact: [
      { change: "+0.15%", direction: "up", name: "饮料制造" },
      { change: "-0.52%", direction: "down", name: "食品加工制造" },
    ],
    rankLabel: "雪球热点 NO.4",
    summary:
      "早盘食品饮料板块再度活跃，皇氏集团4连板，一鸣食品、会稽山、熊猫乳品、百合股份、好想你等跟涨。公开数据表明，消费复苏节奏仍在分化，渠道库存和终端动销是重要观察项。",
    title: "食品饮料板块活跃，皇氏集团4连板",
  },
  {
    id: "green-power",
    impact: [
      { change: "+1.24%", direction: "up", name: "电力" },
      { change: "+0.96%", direction: "up", name: "新能源" },
    ],
    rankLabel: "雪球热点 NO.5",
    summary:
      "绿电概念拉升，市场重新评估装机增长和消纳改善预期。项目收益仍取决于利用小时、上网电价和融资成本。",
    title: "绿电概念拉升，金开新能涨停",
  },
  {
    id: "super-node",
    impact: [
      { change: "+3.05%", direction: "up", name: "算力基础设施" },
      { change: "+2.41%", direction: "up", name: "服务器" },
    ],
    rankLabel: "雪球热点 NO.6",
    summary:
      "超节点概念走强，资金关注高密度算力集群相关环节。技术路线仍在快速演进，供应链验证和产品交付能力比概念热度更值得持续跟踪。",
    title: "超节点概念走强，共进股份涨停",
  },
  {
    id: "pcb-active",
    impact: [
      { change: "+2.52%", direction: "up", name: "印制电路板" },
      { change: "+1.77%", direction: "up", name: "电子元件" },
    ],
    rankLabel: "雪球热点 NO.7",
    summary:
      "PCB 板块保持活跃，高速高频材料和高多层板需求受到关注。扩产计划能否转化为有效收入，需要结合稼动率和良率变化观察。",
    title: "PCB概念活跃，方邦股份大涨",
  },
  {
    id: "ai-apps",
    impact: [
      { change: "+1.88%", direction: "up", name: "软件服务" },
      { change: "+1.39%", direction: "up", name: "人工智能" },
    ],
    rankLabel: "雪球热点 NO.8",
    summary:
      "AI 应用端走强，企业软件和行业解决方案受到资金关注。商业化落地仍应重点观察付费客户数量、续费率与推理成本。",
    title: "AI应用端走强，榕基软件涨停",
  },
  {
    id: "us-cpi",
    impact: [
      { change: "+0.36%", direction: "up", name: "全球权益" },
      { change: "-0.21%", direction: "down", name: "美元指数" },
    ],
    rankLabel: "雪球热点 NO.9",
    summary:
      "美国 CPI 数据符合市场预期，交易重心重新回到核心通胀和就业韧性。单月数据不宜过度外推，利率路径仍取决于后续连续数据。",
    title: "美国7月CPI涨3.4%符合预期，核心通胀继续回落",
  },
  {
    id: "tencent-ai-return",
    impact: [
      { change: "+1.16%", direction: "up", name: "互联网" },
      { change: "+0.72%", direction: "up", name: "云计算" },
    ],
    rankLabel: "雪球热点 NO.10",
    summary:
      "腾讯 AI 相关投入持续增加，市场关注资本开支对广告、云服务与内容业务的带动。评估投入回报需要结合收入增量和利润率变化。",
    title: "腾讯AI算力投入回报验证：售价溢价30%",
  },
] as const;

export const findHomeTopic = (topicId: string): HomeTopic | undefined =>
  homeTopics.find((topic) => topic.id === topicId);
