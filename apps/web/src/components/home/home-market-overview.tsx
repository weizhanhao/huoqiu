"use client";

import Link from "next/link";
import { useState } from "react";

import {
  type HomeOptionalType,
  useOptionalHomeView,
} from "./home-view-context";

type OptionalType = HomeOptionalType;

const indexSlides = [
  [
    { name: "上证指数", value: "3962.17", change: "+0.39%", direction: "up" },
    { name: "深证成指", value: "14517.68", change: "+0.72%", direction: "up" },
    { name: "创业板指", value: "3656.74", change: "+1.52%", direction: "up" },
  ],
  [
    {
      name: "恒生指数",
      value: "25396.51",
      change: "-0.17%",
      direction: "down",
    },
    { name: "国企指数", value: "8426.49", change: "-0.23%", direction: "down" },
    {
      name: "恒生科技指数",
      value: "4792.39",
      change: "+0.33%",
      direction: "up",
    },
  ],
  [
    {
      name: "道琼斯指数",
      value: "53839.99",
      change: "+0.13%",
      direction: "up",
    },
    {
      name: "纳斯达克综合指数",
      value: "26803.03",
      change: "+0.81%",
      direction: "up",
    },
    {
      name: "标普500指数",
      value: "7798.99",
      change: "+0.65%",
      direction: "up",
    },
  ],
  [
    { name: "日经225", value: "43274.67", change: "+0.48%", direction: "up" },
    { name: "德国DAX", value: "24182.36", change: "-0.12%", direction: "down" },
    { name: "法国CAC40", value: "7814.08", change: "+0.21%", direction: "up" },
  ],
] as const;

const optionalPanels = {
  stock: {
    actionHref: "/watchlist",
    columns: ["全部", "当前价", "涨跌幅", "成交量", "总市值"],
    empty: "空空如也，挑选你感兴趣的股票吧",
    heading: "火球高人气股票",
    subtitle: "帮你从热门行业龙头中选股票",
    items: [
      ["通策医疗", "稳步扩张，领航连锁口腔", "37.04", "-0.40%", "down"],
      ["海螺水泥", "现金充裕的行业样本", "17.70", "+0.45%", "up"],
      ["融创中国", "并购扩张的地产观察", "0.61", "+8.93%", "up"],
      ["长城汽车", "SUV 与新能源车观察", "15.75", "+1.03%", "up"],
      ["长江电力", "水电标杆，稳健经营", "28.02", "-1.02%", "down"],
      ["贵州茅台", "消费行业公开数据样本", "1343.00", "-0.26%", "down"],
    ],
  },
  fund: {
    actionHref: "/watchlist?type=fund",
    columns: ["全部", "净值", "涨跌幅", "近一月", "近一年"],
    empty: "空空如也，挑选你感兴趣的基金吧",
    heading: "主动优选",
    subtitle: "看好牛人，选主动基金",
    items: [
      [
        "易方达蓝筹精选",
        "张坤代表作，A 股两地选股",
        "+54.62%",
        "成立以来",
        "up",
      ],
      ["国富大中华精选", "覆盖多种行业和市场", "+236.60%", "成立以来", "up"],
      ["大成策略回报", "深度价值风格的余产管理", "+884.62%", "成立以来", "up"],
      [
        "融通行业景气混合",
        "以景气度为核心寻找赛道",
        "+966.23%",
        "成立以来",
        "up",
      ],
      ["国富中小盘股票", "双十老将赵晓东代表作", "+357.31%", "成立以来", "up"],
      ["鹏华新兴产业混合", "不抱团的成长股老将", "+410.84%", "成立以来", "up"],
    ],
  },
  portfolio: {
    actionHref: "/portfolios",
    columns: ["全部", "净值", "日收益", "月收益", "总收益"],
    empty: "空空如也，挑选你感兴趣的组合吧",
    heading: "高人气组合",
    subtitle: "从公开调仓记录中挑选组合",
    items: [
      ["长期价值观察", "消费与高分红仓位", "1.268", "+26.80%", "up"],
      ["科技成长样本", "半导体和人工智能", "1.416", "+41.60%", "up"],
      ["股息稳健组合", "现金流与低波动", "1.184", "+18.40%", "up"],
      ["港股互联网观察", "平台经济公开样本", "0.973", "-2.70%", "down"],
      ["全球指数配置", "多市场分散投资", "1.092", "+9.20%", "up"],
      ["红利低波仓", "公用事业与金融", "1.156", "+15.60%", "up"],
    ],
  },
} as const;

const optionalRowMetrics = {
  stock: [
    ["11.36万手", "164.92亿"],
    ["23.41万手", "855.36亿"],
    ["142.90万手", "752.44亿"],
    ["41.61万手", "276.13亿"],
    ["6.88万手", "810.42亿"],
    ["2.96万手", "1.64万亿"],
  ],
  fund: [
    ["+3.12%", "+18.46%"],
    ["+4.28%", "+22.17%"],
    ["+2.41%", "+16.83%"],
    ["+5.06%", "+31.29%"],
    ["+1.94%", "+13.72%"],
    ["+3.67%", "+24.55%"],
  ],
  portfolio: [
    ["+0.42%", "1.2万"],
    ["+1.16%", "2.8万"],
    ["+0.18%", "9800"],
    ["-0.35%", "1.6万"],
    ["+0.27%", "7600"],
    ["+0.31%", "1.1万"],
  ],
} as const;

function Sparkline() {
  return (
    <svg
      aria-hidden="true"
      className="home-index-sparkline"
      viewBox="0 0 84 26"
    >
      <path className="sparkline-guide" d="M1 20.5h82" />
      <path d="m2 19 6-6 5 2 5-8 6 5 6-3 6 4 7-8 5 5 7-2 6 5 7-7 6 3 8-5" />
    </svg>
  );
}

export function HomeMarketOverview({
  initialType = "stock",
  watchlistView = false,
}: Readonly<{
  initialType?: OptionalType;
  watchlistView?: boolean;
}>) {
  const [activeType, setActiveType] = useState<OptionalType>(initialType);
  const [localAddedTypes, setLocalAddedTypes] = useState<
    ReadonlySet<OptionalType>
  >(new Set());
  const [localDismissedTypes, setLocalDismissedTypes] = useState<
    ReadonlySet<OptionalType>
  >(new Set());
  const [notice, setNotice] = useState("");
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [indexSlide, setIndexSlide] = useState(watchlistView ? 2 : 0);
  const homeView = useOptionalHomeView();
  const panel = optionalPanels[activeType];
  const activeIndices = indexSlides[indexSlide] ?? indexSlides[0];
  const addedTypes = homeView?.addedOptionalTypes ?? localAddedTypes;
  const dismissedTypes =
    homeView?.dismissedOptionalTypes ?? localDismissedTypes;
  const customEntries =
    homeView?.addedOptionalEntries.filter(
      (entry) => entry.type === activeType,
    ) ?? [];
  const defaultItems = addedTypes.has(activeType) ? panel.items : [];
  const tableItems = [
    ...customEntries.map(
      (entry) =>
        [
          entry.name,
          entry.label || entry.symbol,
          entry.value,
          entry.change,
          entry.direction,
        ] as const,
    ),
    ...defaultItems.filter(
      ([name]) => !customEntries.some((entry) => entry.name === name),
    ),
  ];
  const hasAddedItems = tableItems.length > 0;
  const recommendationsVisible =
    !watchlistView && !hasAddedItems && !dismissedTypes.has(activeType);

  const addRecommendations = () => {
    if (homeView) homeView.addOptionalType(activeType);
    else setLocalAddedTypes((current) => new Set(current).add(activeType));
    setNotice(`已将 ${panel.items.length} 项加入自选`);
  };

  const dismissRecommendations = () => {
    if (homeView) homeView.dismissOptionalType(activeType);
    else setLocalDismissedTypes((current) => new Set(current).add(activeType));
    setNotice("已关闭本组推荐");
  };

  return (
    <>
      <section className="home-index-carousel" aria-label="指数快照轮播">
        <button
          aria-label="上一组指数"
          className="home-index-arrow home-index-arrow-prev"
          onClick={() =>
            setIndexSlide(
              (current) =>
                (current + indexSlides.length - 1) % indexSlides.length,
            )
          }
          type="button"
        >
          ‹
        </button>
        <div className="home-index-strip">
          {activeIndices.map((index) => (
            <Link
              className={`home-index-item home-index-item-${index.direction}`}
              href="/markets"
              key={index.name}
            >
              <div className="home-index-value">
                <strong>{index.value}</strong>
                <span>{index.name}</span>
                <b
                  className={
                    index.direction === "up" ? "market-up" : "market-down"
                  }
                >
                  {index.change}
                </b>
              </div>
              <Sparkline />
            </Link>
          ))}
        </div>
        <button
          aria-label="下一组指数"
          className="home-index-arrow home-index-arrow-next"
          onClick={() =>
            setIndexSlide((current) => (current + 1) % indexSlides.length)
          }
          type="button"
        >
          ›
        </button>
      </section>
      <div className="home-index-pagination" aria-label="选择指数分组">
        {indexSlides.map((_, slide) => (
          <button
            aria-label={`第${slide + 1}组指数`}
            aria-pressed={indexSlide === slide}
            key={slide}
            onClick={() => setIndexSlide(slide)}
            type="button"
          />
        ))}
      </div>

      <section
        className={`home-optional${watchlistView ? " home-optional-watchlist" : ""}`}
        aria-labelledby="optional-title"
      >
        <div
          className="home-optional-tabs"
          role="tablist"
          aria-label="自选类型"
        >
          {(["stock", "fund", "portfolio"] as const).map((type) => (
            <button
              aria-controls="home-optional-panel"
              aria-selected={activeType === type}
              key={type}
              onClick={() => {
                setActiveType(type);
                setCreateMenuOpen(false);
                setNotice("");
              }}
              role="tab"
              type="button"
            >
              {type === "stock"
                ? "自选股票"
                : type === "fund"
                  ? "自选基金"
                  : "自选组合"}
            </button>
          ))}
        </div>

        {watchlistView ? (
          <div className="home-watchlist-tools">
            {activeType === "portfolio" ? (
              <div className="home-create-portfolio">
                <button
                  aria-expanded={createMenuOpen}
                  aria-haspopup="menu"
                  className="home-create-portfolio-trigger"
                  onClick={() => setCreateMenuOpen((current) => !current)}
                  type="button"
                >
                  创建组合
                </button>
                {createMenuOpen ? (
                  <div className="home-create-portfolio-menu" role="menu">
                    {(["股票组合", "场外基金组合"] as const).map((kind) => (
                      <button
                        key={kind}
                        onClick={() => {
                          setCreateMenuOpen(false);
                          setNotice(`已选择${kind}，可继续填写组合信息`);
                        }}
                        role="menuitem"
                        type="button"
                      >
                        {kind}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <label>
                <span className="visually-hidden">添加自选</span>
                <input
                  aria-label={
                    activeType === "stock" ? "添加自选股票" : "添加自选基金"
                  }
                  placeholder={
                    activeType === "stock" ? "添加自选股票" : "添加自选基金"
                  }
                  type="search"
                />
                <span aria-hidden="true">⌕</span>
              </label>
            )}
            <label className="home-watchlist-checkbox">
              <input defaultChecked type="checkbox" />
              <span>添加到首页</span>
            </label>
          </div>
        ) : (
          <Link
            className="home-optional-settings"
            href="/settings"
            aria-label="自选设置"
          >
            ◇
          </Link>
        )}

        <div
          className="home-optional-panel"
          id="home-optional-panel"
          role="tabpanel"
        >
          <div
            className="home-optional-table"
            aria-label={`${activeType}自选列表`}
          >
            <div className="home-optional-columns">
              {panel.columns.map((column, index) => (
                <span key={column}>
                  {column}
                  {index === 0 ? "⌔" : " ↕"}
                </span>
              ))}
              <span aria-hidden="true" />
            </div>
            {hasAddedItems ? (
              <div className="home-optional-rows">
                {tableItems.map(
                  ([name, label, value, change, direction], index) => {
                    const [metricOne, metricTwo] = optionalRowMetrics[
                      activeType
                    ][index] ?? ["--", "--"];
                    return (
                      <div className="home-optional-row" key={name}>
                        <span className="home-optional-row-name">
                          <strong>{name}</strong>
                          <small>{label}</small>
                        </span>
                        <strong className={`market-${direction}`}>
                          {value}
                        </strong>
                        <strong className={`market-${direction}`}>
                          {change}
                        </strong>
                        <span>{metricOne}</span>
                        <span>{metricTwo}</span>
                        <button aria-label={`${name}更多操作`} type="button">
                          ⋯
                        </button>
                      </div>
                    );
                  },
                )}
              </div>
            ) : watchlistView && activeType === "portfolio" ? (
              <div className="home-portfolio-empty">
                <span aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <p>该分组下暂无自选组合，点击右上方按钮可创建组合</p>
              </div>
            ) : (
              <p>{panel.empty}</p>
            )}
          </div>

          {recommendationsVisible ? (
            <div className="home-recommendations">
              <div className="home-recommendations-heading">
                <h2 id="optional-title">{panel.heading}</h2>
                <p>{panel.subtitle}</p>
                <button
                  type="button"
                  aria-label="关闭推荐"
                  onClick={dismissRecommendations}
                >
                  ×
                </button>
              </div>
              <div className="home-recommendations-grid">
                {panel.items.map(([name, label, value, change, direction]) => (
                  <Link
                    className="home-recommendation"
                    href={panel.actionHref}
                    key={name}
                  >
                    <span className="home-recommendation-copy">
                      <strong>{name}</strong>
                      <small>{label}</small>
                    </span>
                    <span className="home-recommendation-value">
                      <strong className={`market-${direction}`}>{value}</strong>
                      <small className={`market-${direction}`}>{change}</small>
                    </span>
                    <span
                      className="home-recommendation-check"
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                  </Link>
                ))}
              </div>
              <button
                className="home-recommendations-action"
                onClick={addRecommendations}
                type="button"
              >
                一键加自选
              </button>
            </div>
          ) : null}
          <p aria-live="polite" className="home-optional-notice">
            {notice}
          </p>
        </div>
      </section>
    </>
  );
}
