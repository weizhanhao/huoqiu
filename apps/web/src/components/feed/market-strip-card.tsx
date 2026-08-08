import type { D0Fixture } from "@huoqiu/contracts/d0";
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
    <section className="feed-card market-strip-card" aria-label="合成市场快照">
      <div className="feed-card-heading">
        <div>
          <p className="card-kicker">MARKET FIXTURE</p>
          <h2>{readPayloadString(card.payload, "title", "合成行情")}</h2>
        </div>
        <span>{fixture.market.as_of.slice(0, 16).replace("T", " ")} UTC</span>
      </div>
      <div className="market-strip-grid">
        {instruments.map((instrument) => {
          const quote = fixture.quotes.find(
            (candidate) => candidate.listing_id === instrument.listing_id,
          );
          return (
            <a
              className="market-strip-quote"
              href={`/instruments/${instrument.listing_id}`}
              key={instrument.listing_id}
            >
              <span>
                <strong>{instrument.name}</strong>
                <small>{instrument.symbol}</small>
              </span>
              <span className="market-up">
                <strong>{quote?.last ?? "--"}</strong>
                <small>+{quote?.change_pct ?? "--"}%</small>
              </span>
            </a>
          );
        })}
      </div>
      <p className="card-disclosure">
        {readPayloadString(card.payload, "notice", "演示数据，不构成投资建议")}
      </p>
    </section>
  );
}
