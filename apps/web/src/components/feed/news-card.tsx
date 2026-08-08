import type { D0Fixture } from "@huoqiu/contracts/d0";
import type { FeedCardV1 } from "@huoqiu/contracts/feed/card-v1";

import { readPayloadString } from "./feed-payload";

type NewsCardProperties = Readonly<{
  card: FeedCardV1;
  fixture: D0Fixture;
}>;

export function NewsCard({ card }: NewsCardProperties) {
  return (
    <article className="feed-card content-card news-card">
      <header className="news-source">
        <span className="news-source-mark" aria-hidden="true">
          讯
        </span>
        <strong>
          {readPayloadString(card.payload, "publisher", "火球演示资讯")}
        </strong>
        <time dateTime={card.published_at}>
          {card.published_at.slice(0, 16).replace("T", " ")} UTC
        </time>
      </header>
      <h2>{readPayloadString(card.payload, "title", "演示资讯")}</h2>
      <p>{readPayloadString(card.payload, "summary", "暂无摘要")}</p>
      <footer>
        <span>来源：{card.source}</span>
        <span>演示数据</span>
      </footer>
    </article>
  );
}
