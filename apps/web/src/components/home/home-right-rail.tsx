"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { homeTopics } from "./home-topics";
import { useOptionalHomeView } from "./home-view-context";

const marketRows = {
  全球: [
    ["腾讯控股", "-1.95%", "down"],
    ["泡泡玛特", "-1.11%", "down"],
    ["长鑫科技", "+6.19%", "up"],
    ["羚锐制药", "-9.22%", "down"],
    ["中际旭创", "+3.84%", "up"],
    ["科创半导体ETF华夏", "+2.16%", "up"],
    ["大极实业", "+7.12%", "up"],
    ["景旺电子", "+10.00%", "up"],
  ],
  沪深: [
    ["中际旭创", "+3.84%", "up"],
    ["大极实业", "+7.12%", "up"],
    ["景旺电子", "+10.00%", "up"],
    ["羚锐制药", "-9.22%", "down"],
    ["工业富联", "+2.47%", "up"],
    ["药明康德", "-1.06%", "down"],
    ["紫金矿业", "+1.42%", "up"],
    ["华友钴业", "+4.31%", "up"],
  ],
  港股: [
    ["腾讯控股", "-1.95%", "down"],
    ["泡泡玛特", "-1.11%", "down"],
    ["快手-W", "+4.18%", "up"],
    ["阿里巴巴-W", "+1.24%", "up"],
    ["美团-W", "-0.74%", "down"],
    ["小米集团-W", "+2.16%", "up"],
    ["中芯国际", "+3.46%", "up"],
    ["京东集团-SW", "+1.05%", "up"],
  ],
  美股: [
    ["NVIDIA", "+2.13%", "up"],
    ["Lumentum", "+8.02%", "up"],
    ["Coherent", "+7.65%", "up"],
    ["Apple", "-0.28%", "down"],
    ["Microsoft", "+0.72%", "up"],
    ["Tesla", "-1.34%", "down"],
    ["Meta", "+1.19%", "up"],
    ["Amazon", "+0.84%", "up"],
  ],
} as const;

type Market = keyof typeof marketRows;

const hotStockSymbols: Readonly<Record<string, string>> = {
  腾讯控股: "HK00700",
  泡泡玛特: "HK09992",
  长鑫科技: "SH688709",
  羚锐制药: "SH600285",
  中际旭创: "SZ300308",
  科创半导体ETF华夏: "SH588170",
  大极实业: "SH600667",
  景旺电子: "SH603228",
  工业富联: "SH601138",
  药明康德: "SH603259",
  紫金矿业: "SH601899",
  华友钴业: "SH603799",
  "快手-W": "HK01024",
  "阿里巴巴-W": "HK09988",
  "美团-W": "HK03690",
  "小米集团-W": "HK01810",
  中芯国际: "HK00981",
  "京东集团-SW": "HK09618",
  NVIDIA: "NASDAQ:NVDA",
  Lumentum: "NASDAQ:LITE",
  Coherent: "NYSE:COHR",
  Apple: "NASDAQ:AAPL",
  Microsoft: "NASDAQ:MSFT",
  Tesla: "NASDAQ:TSLA",
  Meta: "NASDAQ:META",
  Amazon: "NASDAQ:AMZN",
};

const gainers = {
  沪深: [
    ["N杰理", "SZ301626", "182.40", "36.48", "6.2万"],
    ["浩淼科技", "BJ831856", "29.94", "18.79", "1.8万"],
    ["盖世食品", "BJ836826", "22.25", "14.01", "2.1万"],
    ["长进光子", "SH688048", "20.00", "44.28", "3.9万"],
    ["炬光科技", "SH688167", "20.00", "92.16", "5.4万"],
    ["威士顿", "SZ301315", "19.99", "71.22", "2.6万"],
    ["蓝盾光电", "SZ300862", "19.99", "31.08", "4.1万"],
    ["超研股份", "SZ301602", "19.97", "27.96", "1.3万"],
    ["节能铁汉", "SZ300197", "19.79", "3.39", "9.8万"],
    ["瑞纳智能", "SZ301129", "17.25", "28.56", "1.7万"],
  ],
  港股: [
    ["鸿腾精密", "HK06088", "23.86", "5.92", "7.2万"],
    ["微创机器人-B", "HK02252", "18.42", "31.50", "4.6万"],
    ["中国儒意", "HK00136", "15.33", "3.61", "12.1万"],
    ["金蝶国际", "HK00268", "13.78", "15.68", "10.5万"],
    ["优必选", "HK09880", "11.20", "119.90", "8.4万"],
  ],
  美股: [
    ["Lumentum", "NASDAQ:LITE", "8.02", "168.32", "8.1万"],
    ["Coherent", "NYSE:COHR", "7.65", "96.44", "6.8万"],
    ["Nebius", "NASDAQ:NBIS", "6.78", "72.60", "5.9万"],
    ["CoreWeave", "NASDAQ:CRWV", "5.92", "126.15", "9.2万"],
    ["AMD", "NASDAQ:AMD", "4.16", "181.42", "38.6万"],
  ],
} as const;

const popularFunds = [
  ["财通价值动量混合", "720001", "25.38"],
  ["财通新视野混合A", "005851", "25.03"],
  ["广发石油指数A", "162719", "21.76"],
  ["前海开源金银珠宝A", "001302", "19.88"],
  ["易方达标普信息科技指数(QDII-LOF)A", "161128", "19.80"],
  ["工银黄金ETF联接A", "008142", "18.62"],
  ["中加转型动力混合A", "005775", "17.79"],
  ["华安标普全球石油指数", "160416", "16.73"],
  ["银华智荟内在价值", "005119", "16.24"],
  ["万家品质生活混合A", "519195", "16.08"],
] as const;

export function HomeRightRail({
  activeTopicId,
}: Readonly<{ activeTopicId?: string | undefined }>) {
  const [market, setMarket] = useState<Market>("全球");
  const [range, setRange] = useState<"1h" | "24h">("1h");
  const [gainerMarket, setGainerMarket] = useState<"沪深" | "港股" | "美股">(
    "沪深",
  );
  const [hoveredEntry, setHoveredEntry] = useState("");
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const homeView = useOptionalHomeView();

  const clearHoverTimer = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  const showEntryAfterDelay = (key: string) => {
    clearHoverTimer();
    hoverTimerRef.current = setTimeout(() => {
      setHoveredEntry(key);
      hoverTimerRef.current = null;
    }, 900);
  };

  const hideEntry = () => {
    clearHoverTimer();
    setHoveredEntry("");
  };

  useEffect(() => clearHoverTimer, []);

  const addStockEntry = ({
    change,
    direction = "up",
    name,
    symbol,
    value,
  }: Readonly<{
    change: string;
    direction?: "down" | "up";
    name: string;
    symbol: string;
    value: string;
  }>) => {
    homeView?.addOptionalEntry({
      change,
      direction,
      label: symbol,
      name,
      symbol,
      type: "stock",
      value,
    });
  };

  return (
    <>
      <section className="rail-card">
        <div className="rail-heading">
          <h2>热门话题</h2>
          <Link href="/community">更多</Link>
        </div>
        <ol className="hot-list">
          {homeTopics.map((topic, index) => (
            <li key={topic.id}>
              <Link
                aria-current={activeTopicId === topic.id ? "page" : undefined}
                href={`/topics/${topic.id}`}
              >
                <span>{index + 1}</span>
                <strong>{topic.title}</strong>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="rail-card home-hot-ranking">
        <div className="rail-heading">
          <h2>热股榜</h2>
          <Link href="/markets/rankings">更多</Link>
        </div>
        <div
          className="home-rail-market-tabs"
          role="tablist"
          aria-label="热股市场"
        >
          {(Object.keys(marketRows) as Market[]).map((item) => (
            <button
              aria-selected={market === item}
              key={item}
              onClick={() => setMarket(item)}
              role="tab"
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <div className="home-rail-range-tabs" aria-label="热股时间范围">
          <button
            aria-pressed={range === "1h"}
            onClick={() => setRange("1h")}
            type="button"
          >
            1小时内最热
          </button>
          <button
            aria-pressed={range === "24h"}
            onClick={() => setRange("24h")}
            type="button"
          >
            24小时内最热
          </button>
        </div>
        <ol className="home-ranking-list">
          {marketRows[market].map(([name, change, direction], index) => {
            const symbol = hotStockSymbols[name] ?? `${market}-${index + 1}`;
            const key = `hot-${market}-${symbol}`;
            const value = (18.08 + index * 7.91).toFixed(2);
            const added = homeView?.addedOptionalEntries.some(
              (candidate) =>
                candidate.type === "stock" && candidate.symbol === symbol,
            );
            return (
              <li
                key={name}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setHoveredEntry("");
                  }
                }}
                onFocus={() => {
                  clearHoverTimer();
                  setHoveredEntry(key);
                }}
                onMouseEnter={() => showEntryAfterDelay(key)}
                onMouseLeave={hideEntry}
              >
                <Link href="/markets/rankings">
                  <span>{index + 1}</span>
                  <strong>{name}</strong>
                  <b className={`market-${direction}`}>{change}</b>
                </Link>
                {hoveredEntry === key ? (
                  <aside
                    aria-label={`${name}行情摘要`}
                    className={`home-ranking-popover ${
                      index < 2 ? "is-below" : "is-above"
                    }`}
                  >
                    <h3>
                      {name} <small>({symbol})</small>
                    </h3>
                    <strong className={`market-${direction}`}>
                      ¥{value} <span>{change}</span>
                    </strong>
                    <p>{12860 + index * 735}人关注</p>
                    <button
                      disabled={added}
                      onClick={() =>
                        addStockEntry({
                          change,
                          direction,
                          name,
                          symbol,
                          value,
                        })
                      }
                      type="button"
                    >
                      {added ? "已自选" : "自选"}
                    </button>
                  </aside>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rail-card home-hot-ranking">
        <div className="rail-heading">
          <h2>涨跌幅榜</h2>
          <Link href="/markets/rankings">更多</Link>
        </div>
        <div className="home-rail-market-tabs">
          {(["沪深", "港股", "美股"] as const).map((item) => (
            <button
              aria-selected={gainerMarket === item}
              key={item}
              onClick={() => setGainerMarket(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
        <ol className="home-ranking-list">
          {gainers[gainerMarket].map((entry, index) => {
            const [name, symbol, change, value, followers] = entry;
            const key = `stock-${symbol}`;
            const added = homeView?.addedOptionalEntries.some(
              (candidate) =>
                candidate.type === "stock" && candidate.symbol === symbol,
            );
            return (
              <li
                key={name}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) {
                    setHoveredEntry("");
                  }
                }}
                onFocus={() => {
                  clearHoverTimer();
                  setHoveredEntry(key);
                }}
                onMouseEnter={() => showEntryAfterDelay(key)}
                onMouseLeave={hideEntry}
              >
                <Link href="/markets/rankings">
                  <span>{index + 1}</span>
                  <strong>{name}</strong>
                  <b className="market-up">+{change}%</b>
                </Link>
                {hoveredEntry === key ? (
                  <aside
                    className={`home-ranking-popover ${
                      index < 2 ? "is-below" : "is-above"
                    }`}
                    aria-label={`${name}行情摘要`}
                  >
                    <h3>
                      {name} <small>({symbol})</small>
                    </h3>
                    <strong className="market-up">
                      ¥{value} <span>+{change}%</span>
                    </strong>
                    <p>{followers}人关注</p>
                    <button
                      disabled={added}
                      onClick={() =>
                        addStockEntry({
                          change: `+${change}%`,
                          name,
                          symbol,
                          value,
                        })
                      }
                      type="button"
                    >
                      {added ? "已自选" : "自选"}
                    </button>
                  </aside>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="rail-card home-hot-ranking home-popular-funds">
        <div className="rail-heading">
          <h2>热门基金</h2>
          <Link href="/funds">更多</Link>
        </div>
        <ol className="home-ranking-list home-fund-ranking-list">
          {popularFunds.map(([name, symbol, change], index) => {
            const key = `fund-${symbol}`;
            const added = homeView?.addedOptionalEntries.some(
              (candidate) =>
                candidate.type === "fund" && candidate.symbol === symbol,
            );
            return (
              <li
                key={symbol}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    setHoveredEntry("");
                }}
                onFocus={() => {
                  clearHoverTimer();
                  setHoveredEntry(key);
                }}
                onMouseEnter={() => showEntryAfterDelay(key)}
                onMouseLeave={hideEntry}
              >
                <Link href="/funds">
                  <span>{index + 1}</span>
                  <strong title={name}>{name}</strong>
                  <small>年化(近5年)</small>
                  <b className="market-up">+{change}%</b>
                </Link>
                {hoveredEntry === key ? (
                  <aside
                    className={`home-ranking-popover home-fund-popover ${
                      index < 2 ? "is-below" : "is-above"
                    }`}
                    aria-label={`${name}基金摘要`}
                  >
                    <h3>
                      {name} <small>({symbol})</small>
                    </h3>
                    <strong className="market-up">
                      近5年年化 <span>+{change}%</span>
                    </strong>
                    <p>公开净值数据 · 热门基金</p>
                    <button
                      disabled={added}
                      onClick={() =>
                        homeView?.addOptionalEntry({
                          change: `+${change}%`,
                          direction: "up",
                          label: symbol,
                          name,
                          symbol,
                          type: "fund",
                          value: "1.2864",
                        })
                      }
                      type="button"
                    >
                      {added ? "已自选" : "自选"}
                    </button>
                  </aside>
                ) : null}
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
