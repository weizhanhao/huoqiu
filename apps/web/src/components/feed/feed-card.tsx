import type { D0Fixture } from "@huoqiu/contracts/d0";
import {
  feedCardV1Schema,
  type FeedCardV1,
} from "@huoqiu/contracts/feed/card-v1";
import type { ComponentType } from "react";

import { PageState } from "../system/page-state";
import { MarketStripCard } from "./market-strip-card";
import { NewsCard } from "./news-card";
import { OpsBannerCard } from "./ops-banner-card";
import { PostCard } from "./post-card";
import { TopicCard } from "./topic-card";

type RegistryCardProperties = Readonly<{
  card: FeedCardV1;
  fixture: D0Fixture;
}>;

export const d0CardRegistry: Readonly<
  Record<FeedCardV1["type"], ComponentType<RegistryCardProperties>>
> = {
  market_strip: MarketStripCard,
  post: PostCard,
  news: NewsCard,
  topic: TopicCard,
  ops_banner: OpsBannerCard,
};

export type UnknownD0CardEvent = Readonly<{
  cardId: string;
  reason: "unsupported-or-invalid";
}>;

const noOpUnknownCardTelemetry: (event: UnknownD0CardEvent) => void = () => {
  // D0 has no telemetry backend. The explicit boundary is injectable in tests.
};

const readCandidateCardId = (candidate: unknown): string => {
  if (
    typeof candidate === "object" &&
    candidate !== null &&
    "card_id" in candidate &&
    typeof candidate.card_id === "string"
  ) {
    return candidate.card_id;
  }
  return "unknown";
};

type D0FeedProperties = Readonly<{
  cards: readonly unknown[];
  fixture: D0Fixture;
  state: "normal" | "loading" | "empty" | "error";
  onUnknownCard?: (event: UnknownD0CardEvent) => void;
}>;

export function D0Feed({
  cards,
  fixture,
  state,
  onUnknownCard = noOpUnknownCardTelemetry,
}: D0FeedProperties) {
  if (state !== "normal") {
    return (
      <PageState
        state={state}
        emptyMessage="暂无演示内容"
        errorMessage="演示内容暂时无法加载"
      />
    );
  }

  if (cards.length === 0) {
    return <PageState state="empty" emptyMessage="暂无演示内容" />;
  }

  const renderedCards = cards.flatMap((candidate) => {
    const result = feedCardV1Schema.safeParse(candidate);
    if (!result.success) {
      onUnknownCard({
        cardId: readCandidateCardId(candidate),
        reason: "unsupported-or-invalid",
      });
      return [];
    }

    const Card = d0CardRegistry[result.data.type];
    return [
      <Card card={result.data} fixture={fixture} key={result.data.card_id} />,
    ];
  });

  return <div className="feed-list">{renderedCards}</div>;
}
