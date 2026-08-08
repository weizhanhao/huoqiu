import type { D0Fixture } from "@huoqiu/contracts/d0";
import type { FeedCardV1 } from "@huoqiu/contracts/feed/card-v1";

import { readPayloadString } from "./feed-payload";

type PostCardProperties = Readonly<{
  card: FeedCardV1;
  fixture: D0Fixture;
}>;

export function PostCard({ card }: PostCardProperties) {
  return (
    <article className="feed-card content-card">
      <header className="content-author">
        <span className="content-avatar" aria-hidden="true">
          演
        </span>
        <div>
          <strong>
            {readPayloadString(card.payload, "author_name", "演示用户")}
          </strong>
          <small>{card.published_at.slice(0, 16).replace("T", " ")} UTC</small>
        </div>
        <span className="content-kind">公开笔记</span>
      </header>
      <h2>{readPayloadString(card.payload, "title", "演示笔记")}</h2>
      <p>{readPayloadString(card.payload, "body", "暂无正文")}</p>
      <footer>
        <span>固定 Fixture 内容</span>
        <span>只读演示</span>
      </footer>
    </article>
  );
}
