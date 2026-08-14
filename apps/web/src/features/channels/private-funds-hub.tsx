"use client";

import { useEffect, useRef, useState } from "react";

import { ScrollableTable } from "../../components/system/scrollable-table";

import styles from "./channels.module.css";

/*
 * 私募频道。
 *
 * 这一页此前是六只虚构产品：「青岚成长演示一号 +24.6%」「衡宇中性演示二号
 * 回撤 -6.2%」——管理人、产品、收益率、回撤全是编的，连策略分类都是。
 *
 * 现在列的是中国证券投资基金业协会公示的真实登记管理人（一万八千多家），
 * 支持按机构类型筛选、按登记编号 / 名称 / 法定代表人检索，每一条都能点回
 * 中基协自己的公示页核对。
 *
 * 有一件事必须说清楚，而不是拿别的东西顶上：**私募的业绩没有公开来源**。
 * 私募基金面向合格投资者，净值与收益依法不得公开披露。所以这一页做的是
 * 登记信息查询，不是业绩排行——排行做不了真的就不做。
 */

const INVEST_TYPES = [
  "私募证券投资基金管理人",
  "私募股权、创业投资基金管理人",
  "私募资产配置类管理人",
  "其他私募投资基金管理人",
] as const;

/** 和取数层的默认分页保持一致，用来算共几页。 */
const PAGE_SIZE = 20;

const TYPE_FILTERS: readonly (readonly [string, string])[] = [
  ["", "全部"],
  ...INVEST_TYPES.map((type) => [type, type] as const),
];

type Manager = Readonly<{
  disclosureUrl: string;
  establishedOn: string | null;
  fundCount: number | null;
  investType: string | null;
  legalPerson: string | null;
  name: string;
  province: string | null;
  registerNo: string | null;
  registeredOn: string | null;
}>;

type State =
  | Readonly<{ kind: "failed" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "ready"; managers: readonly Manager[]; total: number }>;

export function PrivateFundsHub() {
  const [investType, setInvestType] = useState("");
  /* 输入框里的字，和真正发出去查的那个词分开——不然每敲一下都查一次。 */
  const [draft, setDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(0);
  const [state, setState] = useState<State>({ kind: "loading" });
  // 清除关键词后要把焦点交还给它，否则焦点会掉回 body。
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      /*
       * 进「读取中」放在异步体的第一句，而不是 effect 的同步部分：
       * 同步改状态会在同一轮渲染里再触发一次。对用户没有分别——它和
       * 紧随其后的请求本来就是同一件事。
       */
      setState({ kind: "loading" });
      const query = new URLSearchParams({ page: String(page) });
      if (investType.length > 0) query.set("type", investType);
      if (keyword.length > 0) query.set("q", keyword);
      try {
        const response = await fetch(`/api/private-funds?${query.toString()}`);
        if (cancelled) return;
        if (!response.ok) {
          setState({ kind: "failed" });
          return;
        }
        const data = (await response.json()) as {
          managers?: readonly Manager[];
          total?: number;
        };
        if (cancelled) return;
        setState({
          kind: "ready",
          managers: data.managers ?? [],
          total: data.total ?? 0,
        });
      } catch {
        if (!cancelled) setState({ kind: "failed" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [investType, keyword, page]);

  const total = state.kind === "ready" ? state.total : 0;
  const pageCount = Math.ceil(total / PAGE_SIZE);

  return (
    <section
      aria-labelledby="private-funds-heading"
      className={styles.page}
      data-testid="private-funds-hub"
    >
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>私募</p>
          <h1 id="private-funds-heading">私募管理人</h1>
        </div>
        <p className={styles.heroNote}>
          数据来自中国证券投资基金业协会公示系统。私募基金面向合格投资者，
          净值与收益依法不公开披露，本页因此只列登记备案信息，不含业绩。
        </p>
      </header>

      <div aria-label="机构类型筛选" className={styles.filters} role="group">
        {TYPE_FILTERS.map(([value, label]) => (
          <button
            aria-pressed={investType === value}
            key={value === "" ? "all" : value}
            onClick={() => {
              setInvestType(value);
              // 换了筛选条件还停在第 37 页，多半是一片空白。
              setPage(0);
            }}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <form
        method="post"
        className={styles.filters}
        onSubmit={(event) => {
          event.preventDefault();
          setKeyword(draft.trim());
          setPage(0);
        }}
        role="search"
      >
        <label className="visually-hidden" htmlFor="private-fund-search">
          按登记编号、管理人名称或法定代表人检索
        </label>
        <input
          id="private-fund-search"
          ref={searchRef}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="登记编号 / 管理人名称 / 法定代表人"
          type="search"
          value={draft}
        />
        <button type="submit">检索</button>
        {/*
          「清除」常驻，不再按有没有关键词来决定渲染。
          原先它在自己的 onClick 里把 keyword 清空，于是按钮当场从 DOM 上
          消失——焦点掉回 body，读屏静默，键盘用户得从头 Tab 回检索框。
          现在用 aria-disabled 表达不可用，并在清完之后把焦点交回输入框。
        */}
        <button
          aria-disabled={keyword.length === 0}
          onClick={() => {
            if (keyword.length === 0) return;
            setDraft("");
            setKeyword("");
            setPage(0);
            searchRef.current?.focus();
          }}
          type="button"
        >
          清除
        </button>
      </form>

      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>{investType.length === 0 ? "全部机构类型" : investType}</h2>
          <span>
            {state.kind === "ready"
              ? `${total} 家登记管理人`
              : "正在读取中基协公示信息"}
          </span>
        </div>

        {/*
          一句常驻的状态播报，不随状态切换挂载/卸载。
          原先三段各自渲染一个 live region，容器和文字同时插进 DOM——多数
          读屏对这种情况根本不播；于是点了筛选、检索、翻页之后一片沉默，
          用户不知道结果换了没有。成功也要出声，不能只有失败才说话。
        */}
        <p className={styles.empty} role="status">
          {state.kind === "loading"
            ? "正在读取中基协公示信息……"
            : state.kind === "failed"
              ? "中基协公示信息暂时取不到。本页不以样本数据代替。"
              : state.managers.length === 0
                ? "没有符合条件的登记管理人。"
                : `第 ${page + 1} 页，共 ${total} 家登记管理人。`}
        </p>

        {state.kind === "ready" && state.managers.length > 0 ? (
          <ScrollableTable label="私募管理人登记信息">
            <table className={`watchlist-table ${styles.registryTable}`}>
              {/* 表要有名字：读屏的表格列表里念的就是 caption。 */}
              <caption className={styles.empty}>私募管理人登记信息</caption>
              <thead>
                <tr>
                  <th scope="col">管理人</th>
                  <th scope="col">法定代表人</th>
                  <th scope="col">机构类型</th>
                  <th className="watchlist-numeric" scope="col">
                    已备案基金
                  </th>
                  <th scope="col">注册地</th>
                  <th scope="col">登记时间</th>
                </tr>
              </thead>
              <tbody>
                {state.managers.map((manager) => (
                  <tr key={`${manager.registerNo ?? ""}-${manager.name}`}>
                    <th scope="row">
                      {/*
                        点出去是中基协自己的公示页。这一页上的每一条都能
                        在那里原样核对——编的数据没有这种去处。
                      */}
                      <a
                        href={manager.disclosureUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <strong>{manager.name}</strong>
                        <small>{manager.registerNo ?? "—"}</small>
                        {/* 读屏在按下之前就该知道这会跳出站、并新开窗口。 */}
                        <span className="visually-hidden">
                          （中基协公示页，新窗口打开）
                        </span>
                      </a>
                    </th>
                    <td>{manager.legalPerson ?? "—"}</td>
                    <td>{manager.investType ?? "—"}</td>
                    <td className="watchlist-numeric">
                      {manager.fundCount ?? "—"}
                    </td>
                    <td>{manager.province ?? "—"}</td>
                    <td>{manager.registeredOn ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollableTable>
        ) : null}

        {pageCount > 1 ? (
          <div aria-label="翻页" className={styles.filters} role="group">
            {/*
              翻页按钮用 aria-disabled，不用 disabled。
              连续按到最后一页时，disabled 会让浏览器把焦点从这个按钮上收走、
              掉回 body：键盘用户按了一下回车，焦点凭空消失，再按 Tab 从页面
              顶部重来。aria-disabled 保留可聚焦，点击在回调里拦掉。
              翻页成功的反馈由上面那句常驻播报给出。
            */}
            <button
              aria-disabled={page === 0}
              onClick={() => {
                if (page === 0) return;
                setPage((current) => Math.max(0, current - 1));
              }}
              type="button"
            >
              上一页
            </button>
            <span>
              第 {page + 1} / {pageCount} 页
            </span>
            <button
              aria-disabled={page + 1 >= pageCount}
              onClick={() => {
                if (page + 1 >= pageCount) return;
                setPage((current) => Math.min(pageCount - 1, current + 1));
              }}
              type="button"
            >
              下一页
            </button>
          </div>
        ) : null}
      </section>

      <aside aria-label="受限能力说明" className={styles.restricted}>
        <strong>仅信息陈列</strong>
        {/*
          这里原先挂着一个 disabled 的「认购暂未开放」按钮。一个永远按不动的
          按钮不是能力说明，是个摆设——说明写成话就够了。
        */}
        <span>
          私募面向合格投资者，本站不提供认购、预约或联系能力，也不展示业绩。
          登记状态以中基协公示页为准。
        </span>
      </aside>
    </section>
  );
}
