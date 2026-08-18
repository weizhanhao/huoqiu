"use client";

import { ScrollableTable } from "../system/scrollable-table";
import { InstrumentLink } from "../instrument/instrument-link";

import { useState, type FormEvent } from "react";

import { useBrowserStore } from "../../lib/browser-store";

import {
  applyCustomOrder,
  moveWithin,
  NO_ORDER,
  ORDER_STORAGE_KEY,
  parseCustomOrder,
  writeCustomOrder,
} from "./watchlist-order";

import type { D0PageState } from "../../lib/d0-page-state";
import { useD0Watchlist } from "../../stores/d0-watchlist";
import {
  DEFAULT_GROUP,
  useWatchlistGroups,
  watchlistSortOptions,
} from "../../stores/watchlist-groups";
import { useWatchlistQuotes, WatchlistQuotes } from "./watchlist-quotes";
import { PageState } from "../system/page-state";
import { WatchlistToggle } from "./watchlist-toggle";
import styles from "./watchlist-panel.module.css";

type WatchlistPanelProperties = Readonly<{
  /*
   * 真实标的的自选条目，由页面从日线快照算好后传入。
   *
   * 本组件是客户端组件，读不了快照文件；而下面的解析用的是 flatMap，
   * 认不出的 id 会返回空数组被静默丢掉——真实标的加进自选后会直接从列表里
   * 消失，连个说法都没有。所以这一份必须由服务端喂进来。
   */
  realEntries?: readonly WatchlistEntry[];
  state?: D0PageState;
}>;

export type WatchlistEntry = Readonly<{
  listingId: string;
  market: string;
  name: string;
  price: string;
  symbol: string;
  changePct: string;
}>;

export function WatchlistPanel({
  realEntries = [],
  state = "normal",
}: WatchlistPanelProperties) {
  const { listingIds } = useD0Watchlist();
  const {
    activeGroup,
    assign,
    createGroup,
    groupOf,
    groups,
    setActiveGroup,
    setSort,
    sort,
  } = useWatchlistGroups();
  /*
   * 列组切换。
   *
   * 只做「行情」和「资料」两组，因为可用字段就这些：价格、涨跌幅、市场、代码。
   * 雪球那里还有资金和估值两组，但我们没有成交额、市值、PE 这些数据——
   * 为了凑够列数去造几个指标出来，正是这一轮一直在清理的东西。
   */
  const [columnSet, setColumnSet] = useState<"profile" | "quote">("quote");
  /*
   * 自定义顺序。
   *
   * custom 与预置排序互斥：用户手动排过之后，再按涨幅重排会把自己的安排
   * 冲掉，所以切到预置排序时只是暂时不用自定义顺序，顺序本身仍然保留。
   */
  /*
   * 顺序直接订阅存储，不再「先渲染成没排过、挂载后读一次再 setState」——
   * 那样排过序的人每次进来都会看到列表先按默认顺序画一帧再跳成自己的顺序。
   */
  const order = useBrowserStore(ORDER_STORAGE_KEY, parseCustomOrder, NO_ORDER);
  /* null 表示用户这一趟还没点过开关：之前排过就默认按自定义顺序展示。 */
  const [customChoice, setCustom] = useState<boolean | null>(null);
  const custom = customChoice ?? order.length > 0;
  const [newGroup, setNewGroup] = useState("");
  const [groupError, setGroupError] = useState<string | null>(null);
  /*
   * 自选条目全部来自真实标的。
   *
   * 这里此前还从 D0 夹具里查——那条分支现在一次也不会命中：可加自选的
   * 代码只剩真实代码，夹具标的和虚构标的都进不来。而那个 fixture prop
   * 会把整份夹具 JSON 塞进 /watchlist 的载荷，留着只会让下一个人以为
   * 它还有用。
   */
  /*
   * 在不在自选里，由自选自己说了算。
   *
   * 这里原先是「拿 listingId 去 realEntries 里查，查不到就整行丢掉」——而
   * realEntries 来自本地 K 线快照，只有 8 条，且不随代码提交。于是加进自选的
   * 股票只要不在那 8 条里，这块面板就当它不存在，显示「还没有自选」；
   * 而上面那张实时报价表里它明明在。服务器上快照根本没有，这块面板对任何
   * 自选都会说空。
   *
   * 现在成员资格只看自选，报价取不到就按站内惯例显示「—」，而不是把整行抹掉。
   */
  /*
   * 名称与价格取自同一份实时报价——上面那张表用的就是它。
   * 各取各的会出现「上面有数、下面全是横杠」，正是此前的样子。
   */
  const quotes = useWatchlistQuotes(listingIds);
  const entries = listingIds.map<WatchlistEntry>((listingId) => {
    const snapshot = realEntries.find(
      (candidate) => candidate.listingId === listingId,
    );
    const live = quotes.get(listingId);
    return {
      changePct:
        live?.changePercent != null
          ? live.changePercent.toFixed(2)
          : (snapshot?.changePct ?? "—"),
      listingId,
      market: snapshot?.market ?? "—",
      name: live?.name ?? snapshot?.name ?? listingId.toUpperCase(),
      price:
        live?.last != null ? live.last.toFixed(2) : (snapshot?.price ?? "—"),
      symbol: listingId,
    };
  });

  const visible = entries.filter(
    (entry) =>
      activeGroup === DEFAULT_GROUP || groupOf(entry.listingId) === activeGroup,
  );
  // 涨跌幅是字符串，排序前必须转成数值，否则 "-10" 会排在 "9" 前面。
  const toNumber = (value: string): number => Number.parseFloat(value);
  const sorted = custom
    ? applyCustomOrder(visible, order)
    : sort === "added"
      ? visible
      : visible.toSorted((left, right) => {
          if (sort === "name")
            return left.name.localeCompare(right.name, "zh-CN");
          const delta = toNumber(right.changePct) - toNumber(left.changePct);
          return sort === "changeDesc" ? delta : -delta;
        });

  const move = (listingId: string, direction: -1 | 1): void => {
    // 基线取当前可见顺序：用户看到什么顺序，上移就相对什么顺序生效。
    const baseline =
      order.length > 0 ? order : sorted.map((entry) => entry.listingId);
    writeCustomOrder(moveWithin(baseline, listingId, direction));
  };

  const submitGroup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error = createGroup(newGroup);
    setGroupError(error);
    if (error === null) {
      setActiveGroup(newGroup.trim());
      setNewGroup("");
    }
  };

  return (
    <section
      className={`watchlist-panel ${styles.panel}`}
      aria-labelledby="watchlist-heading"
    >
      {/*
        实时行情表。
        下面那份条目列表的价格来自最后一根日线的收盘价——隔夜的陈价，
        盘中看着像「今天一动没动」。这一块按自选代码向公开行情接口取当前价，
        并按品种分页签。
      */}
      <WatchlistQuotes symbols={listingIds} />
      <header className={`watchlist-heading ${styles.heading}`}>
        <div>
          <p className="card-kicker">自选 · 仅本次会话</p>
          <h1 id="watchlist-heading">我的自选</h1>
          <p>仅在当前浏览会话中保存；刷新页面后重置，不会跨设备同步。</p>
        </div>
        {/*
          这里原先挂着一枚「样本数据 · 非实时」的徽标。这一页只有「哪几只在
          我的自选里」是会话内的，价格是向 /api/market/quotes 实时取的真行情
          ——那句话把真数据说成了样本。说自己更假和说自己更真一样，都是不实。
          会话内保存这件事，上面那句已经讲清楚了。
        */}
      </header>

      <div className={`watchlist-toolbar ${styles.toolbar}`}>
        <nav aria-label="自选分组" className="watchlist-groups">
          {groups.map((group) => (
            <button
              aria-pressed={activeGroup === group}
              key={group}
              onClick={() => setActiveGroup(group)}
              type="button"
            >
              {group}
            </button>
          ))}
        </nav>

        <div className={styles.toolbarActions}>
          <div className="watchlist-columns" role="group" aria-label="列组切换">
            {(
              [
                ["quote", "行情"],
                ["profile", "资料"],
              ] as const
            ).map(([id, label]) => (
              <button
                aria-pressed={columnSet === id}
                key={id}
                onClick={() => setColumnSet(id)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <button
            aria-pressed={custom}
            className="watchlist-custom-toggle"
            onClick={() => setCustom(!custom)}
            type="button"
          >
            {custom ? "自定义顺序（已启用）" : "自定义顺序"}
          </button>

          <label className="watchlist-sort">
            <span>排序</span>
            <select
              disabled={custom}
              onChange={(event) => setSort(event.target.value as typeof sort)}
              value={sort}
            >
              {watchlistSortOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <form
            method="post"
            className="watchlist-group-form"
            onSubmit={submitGroup}
          >
            <label className="visually-hidden" htmlFor="watchlist-new-group">
              新建分组名称
            </label>
            <input
              id="watchlist-new-group"
              maxLength={12}
              onChange={(event) => setNewGroup(event.target.value)}
              placeholder="新建分组"
              value={newGroup}
            />
            <button type="submit">新建</button>
          </form>
        </div>
      </div>

      {groupError === null ? null : (
        <p className="watchlist-group-error" role="alert">
          {groupError}
        </p>
      )}

      {state !== "normal" ? (
        <PageState
          state={state}
          emptyMessage="暂无演示自选数据"
          errorMessage="演示自选暂时不可用"
        />
      ) : sorted.length === 0 ? (
        <PageState
          state="empty"
          emptyMessage={
            /*
             * 与下方行情表的空态用同一句话。两条并存时它们措辞不一样，
             * 一条说「从演示标的详情加入」、一条说「在任意标的页点加自选」，
             * 读起来像两个不同的功能；而「演示标的」这个说法本身也过时了
             * ——站内标的现在是真实行情。
             */
            activeGroup === DEFAULT_GROUP
              ? "还没有自选。在任意标的页点「加自选」把它放进来。"
              : `「${activeGroup}」分组内暂无标的`
          }
        />
      ) : (
        <ScrollableTable label="我的自选">
          <table className="watchlist-table">
            <thead>
              <tr>
                <th scope="col">名称 / 代码</th>
                {columnSet === "quote" ? (
                  <>
                    <th scope="col">当前价</th>
                    <th scope="col">涨跌幅</th>
                  </>
                ) : (
                  <>
                    <th scope="col">市场</th>
                    <th scope="col">代码</th>
                  </>
                )}
                <th scope="col">分组</th>
                <th scope="col">操作</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry) => {
                /*
                 * 没有数据时不上色、不加正负号。原先一律按「非负即涨」处理，
                 * 于是取不到价的行显示成红色的「+—%」——既像是涨了，又不成话。
                 */
                const hasChange = entry.changePct !== "—";
                const isUp = hasChange && !entry.changePct.startsWith("-");
                const prefix = hasChange && isUp ? "+" : "";
                const toneClass = hasChange
                  ? isUp
                    ? "market-up"
                    : "market-down"
                  : "";
                return (
                  <tr key={entry.listingId}>
                    <th scope="row">
                      <InstrumentLink symbol={entry.listingId}>
                        <strong>{entry.name}</strong>
                        <small>
                          {entry.symbol} · {entry.market}
                        </small>
                      </InstrumentLink>
                    </th>
                    {columnSet === "quote" ? (
                      <>
                        <td className={toneClass}>{entry.price}</td>
                        <td className={toneClass}>
                          {hasChange ? `${prefix}${entry.changePct}%` : "—"}
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{entry.market}</td>
                        <td>{entry.symbol}</td>
                      </>
                    )}
                    <td>
                      <label
                        className="visually-hidden"
                        htmlFor={`group-${entry.listingId}`}
                      >
                        {entry.name}所属分组
                      </label>
                      <select
                        className="watchlist-group-select"
                        id={`group-${entry.listingId}`}
                        onChange={(event) =>
                          assign(entry.listingId, event.target.value)
                        }
                        value={groupOf(entry.listingId)}
                      >
                        {groups.map((group) => (
                          <option key={group} value={group}>
                            {group}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {/*
                        上移下移只在自定义模式下出现：按涨幅排序时给一个
                        「上移」按钮，点了顺序会被下一次排序冲掉，那是骗人的。
                      */}
                      {custom ? (
                        <span className="watchlist-move">
                          <button
                            aria-label={`把 ${entry.name} 上移一位`}
                            onClick={() => move(entry.listingId, -1)}
                            type="button"
                          >
                            ↑
                          </button>
                          <button
                            aria-label={`把 ${entry.name} 下移一位`}
                            onClick={() => move(entry.listingId, 1)}
                            type="button"
                          >
                            ↓
                          </button>
                        </span>
                      ) : null}
                      <WatchlistToggle
                        listingId={entry.listingId}
                        removeLabel="移出自选"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollableTable>
      )}
    </section>
  );
}
