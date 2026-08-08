import type { D0Fixture } from "@huoqiu/contracts/d0";
import type { FeedCardV1 } from "@huoqiu/contracts/feed/card-v1";

import { readPayloadString } from "./feed-payload";

type OpsBannerCardProperties = Readonly<{
  card: FeedCardV1;
  fixture: D0Fixture;
}>;

export function OpsBannerCard({ card }: OpsBannerCardProperties) {
  return (
    <aside className="feed-card compact-card ops-card">
      <p className="card-kicker">DEMO NOTICE</p>
      <h2>{readPayloadString(card.payload, "title", "演示提示")}</h2>
      <p>{readPayloadString(card.payload, "body", "仅用于功能演示")}</p>
    </aside>
  );
}
