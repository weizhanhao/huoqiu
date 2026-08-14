import type { D0Fixture } from "@huoqiu/contracts/d0";
import { InstrumentLink } from "../instrument/instrument-link";
import type { FeedCardV1 } from "@huoqiu/contracts/feed/card-v1";

import { readPayloadString, readPayloadStringArray } from "./feed-payload";

type MarketStripCardProperties = Readonly<{
  card: FeedCardV1;
  fixture: D0Fixture;
}>;

export function MarketStripCard({ card, fixture }: MarketStripCardProperties) {
  const listingIds = readPayloadStringArray(card.payload, "listing_ids");
  const instruments = fixture.instruments.filter((instrument) =>
    listingIds.includes(instrument.listing_id),
  );

  return (
    <section className="feed-card market-strip-card" aria-label="样本市场快照">
      <div className="feed-card-heading">
        <div>
          <p className="card-kicker">行情 · 演示数据</p>
          <h2>{readPayloadString(card.payload, "title", "样本行情")}</h2>
        </div>
        <span>{fixture.market.as_of.slice(0, 16).replace("T", " ")} UTC</span>
      </div>
      <div className="market-strip-grid">
        {instruments.map((instrument) => {
          const quote = fixture.quotes.find(
            (candidate) => candidate.listing_id === instrument.listing_id,
          );
          return (
            <InstrumentLink
              className="market-strip-quote"
              key={instrument.listing_id}
              symbol={instrument.listing_id}
            >
              <span>
                <strong>{instrument.name}</strong>
                <small>{instrument.symbol}</small>
              </span>
              <span className="market-up">
                <strong>{quote?.last ?? "--"}</strong>
                <small>+{quote?.change_pct ?? "--"}%</small>
              </span>
            </InstrumentLink>
          );
        })}
      </div>
      <p className="card-disclosure">
        {readPayloadString(card.payload, "notice", "演示数据，不构成投资建议")}
      </p>
    </section>
  );
}
