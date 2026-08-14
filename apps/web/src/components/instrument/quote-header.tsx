import type { D0Fixture } from "@huoqiu/contracts/d0";

import { DemoDataBadge } from "../system/demo-data-badge";
import { WatchlistToggle } from "../watchlist/watchlist-toggle";

type D0Instrument = D0Fixture["instruments"][number];
type D0Quote = D0Fixture["quotes"][number];

const statusLabels: Readonly<Record<D0Instrument["status"], string>> = {
  open: "交易中",
  closed: "已收盘",
  halted: "已停牌",
};

type QuoteHeaderProperties = Readonly<{
  instrument: D0Instrument;
  quote: D0Quote;
}>;

export function QuoteHeader({ instrument, quote }: QuoteHeaderProperties) {
  const isUp = !quote.change.startsWith("-");
  const changePrefix = isUp ? "+" : "";

  return (
    <header className="quote-header">
      <div className="quote-identity">
        <div>
          <p className="card-kicker">演示标的</p>
          <h2>{instrument.name}</h2>
          <p>
            {instrument.symbol} · {instrument.market} · {instrument.currency}
          </p>
        </div>
        <div className="quote-actions">
          <DemoDataBadge />
          <WatchlistToggle listingId={instrument.listing_id} />
        </div>
      </div>
      <div className="quote-primary">
        <strong className={isUp ? "market-up" : "market-down"}>
          {quote.last}
        </strong>
        <span className={isUp ? "market-up" : "market-down"}>
          {changePrefix}
          {quote.change} · {changePrefix}
          {quote.change_pct}%
        </span>
      </div>
      <dl className="quote-meta">
        <div>
          <dt>状态</dt>
          <dd>
            {instrument.market} · {instrument.currency} ·{" "}
            {statusLabels[instrument.status]}
          </dd>
        </div>
        <div>
          <dt>数据来源</dt>
          <dd>{quote.source}</dd>
        </div>
        <div>
          <dt>快照时间</dt>
          <dd>
            <time dateTime={quote.as_of}>{quote.as_of}</time>
          </dd>
        </div>
        <div>
          <dt>授权</dt>
          <dd>{quote.entitlement}</dd>
        </div>
      </dl>
    </header>
  );
}
