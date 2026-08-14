import type { D0Fixture } from "@huoqiu/contracts/d0";
import type { FeedCardV1 } from "@huoqiu/contracts/feed/card-v1";

import { readPayloadString } from "./feed-payload";

type TopicCardProperties = Readonly<{
  card: FeedCardV1;
  fixture: D0Fixture;
}>;

export function TopicCard({ card }: TopicCardProperties) {
  return (
    <section className="feed-card compact-card">
      <p className="card-kicker">话题 · 演示数据</p>
      <h2>{readPayloadString(card.payload, "title", "演示话题")}</h2>
      <p>{readPayloadString(card.payload, "summary", "暂无话题摘要")}</p>
    </section>
  );
}
