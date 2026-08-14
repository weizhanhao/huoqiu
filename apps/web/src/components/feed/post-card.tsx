import type { D0Fixture } from "@huoqiu/contracts/d0";
import type { FeedCardV1 } from "@huoqiu/contracts/feed/card-v1";
import Link from "next/link";

import { CardReactions } from "./card-reactions";
import { readPayloadString } from "./feed-payload";

type PostCardProperties = Readonly<{
  card: FeedCardV1;
  fixture: D0Fixture;
}>;

export function PostCard({ card }: PostCardProperties) {
  const authorId = readPayloadString(
    card.payload,
    "author_id",
    "user_demo_0001",
  );
  const authorName = readPayloadString(card.payload, "author_name", "火球用户");

  return (
    <article className="feed-card content-card">
      <header className="content-author">
        <span className="content-avatar" aria-hidden="true">
          {[...authorName][0] ?? "火"}
        </span>
        <div>
          <strong>
            {/* 作者名过去是纯文本，整张卡片没有任何出口。 */}
            <Link href={`/users/${authorId}`}>{authorName}</Link>
          </strong>
          <small>{card.published_at.slice(0, 16).replace("T", " ")} UTC</small>
        </div>
        <span className="content-kind">公开笔记</span>
      </header>
      <h2>{readPayloadString(card.payload, "title", "未命名笔记")}</h2>
      <p>{readPayloadString(card.payload, "body", "暂无正文")}</p>
      <footer>
        <CardReactions cardId={card.card_id} />
        <Link href="/community">到社区讨论</Link>
      </footer>
    </article>
  );
}
