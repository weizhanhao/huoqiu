import type { D0Fixture } from "@huoqiu/contracts/d0";
import Link from "next/link";

import { PageState } from "../system/page-state";

export type D0Instrument = D0Fixture["instruments"][number];

export const searchD0Listings = (
  query: string,
  fixture: D0Fixture,
): readonly D0Instrument[] => {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  if (normalized.length === 0) {
    return [];
  }

  return fixture.instruments.filter((instrument) =>
    [
      instrument.symbol,
      instrument.name,
      instrument.pinyin,
      ...instrument.aliases,
    ].some((value) => value.toLocaleLowerCase("zh-CN").includes(normalized)),
  );
};

type InstrumentSearchProperties = Readonly<{
  fixture: D0Fixture;
  query: string;
  state: "normal" | "loading" | "empty" | "error";
}>;

export function InstrumentSearch({
  fixture,
  query,
  state,
}: InstrumentSearchProperties) {
  if (state !== "normal") {
    return (
      <PageState
        state={state}
        emptyMessage="没有可搜索的演示标的"
        errorMessage="演示搜索暂时不可用"
      />
    );
  }

  const results = searchD0Listings(query, fixture);
  const hasQuery = query.trim().length > 0;

  return (
    <section className="instrument-search" aria-labelledby="search-heading">
      <div className="search-heading">
        <p className="card-kicker">D0 / FIXTURE SEARCH</p>
        <h2 id="search-heading">搜索演示标的</h2>
        <p>支持代码、名称、拼音和别名；结果不连接外部行情。</p>
      </div>
      <form className="instrument-search-form" action="/search" method="get">
        <label htmlFor="instrument-query">代码、名称、拼音或别名</label>
        <div>
          <input
            id="instrument-query"
            name="q"
            type="search"
            defaultValue={query}
            autoComplete="off"
          />
          <button type="submit">搜索</button>
        </div>
      </form>

      {!hasQuery ? (
        <PageState state="empty" emptyMessage="请输入一个演示标的关键词" />
      ) : results.length === 0 ? (
        <PageState state="empty" emptyMessage="没有找到匹配的演示标的" />
      ) : (
        <ul className="search-results" aria-label="演示标的搜索结果">
          {results.map((instrument) => {
            const quote = fixture.quotes.find(
              (candidate) => candidate.listing_id === instrument.listing_id,
            );
            return (
              <li key={instrument.listing_id}>
                <Link href={`/instruments/${instrument.listing_id}`}>
                  <span>
                    <strong>{instrument.name}</strong>
                    <small>
                      {instrument.symbol} · {instrument.market} ·{" "}
                      {instrument.currency}
                    </small>
                  </span>
                  <span className="search-result-price market-up">
                    <strong>{quote?.last ?? "--"}</strong>
                    <small>+{quote?.change_pct ?? "--"}%</small>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
