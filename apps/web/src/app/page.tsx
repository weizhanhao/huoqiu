import type { Metadata } from "next";

import { D0Feed } from "../components/feed/feed-card";
import { DesktopShell } from "../components/shell/desktop-shell";
import { PageState } from "../components/system/page-state";
import { HomeCommunityStream } from "../features/community/home-community-stream";
import { PostComposer } from "../features/publish/post-composer";
import { RealFinanceHomeSummary } from "../features/real-finance";
import { loadRuntimeFinancePublicViewModel } from "../features/real-finance/finance-snapshot.server";
import { loadD0Fixture } from "../lib/d0-fixture";
import { normalizeD0FixtureState } from "../lib/d0-page-state";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  description: "真实财经来源、社区观察与样本行情",
  title: "首页 · 火球",
};

type HomePageProperties = Readonly<{
  searchParams: Promise<
    Readonly<{ fixture_state?: string | readonly string[] }>
  >;
}>;

export default async function HomePage({ searchParams }: HomePageProperties) {
  const fixtureResult = loadD0Fixture();
  const [parameters, financeModel] = await Promise.all([
    searchParams,
    loadRuntimeFinancePublicViewModel({ selectedRecordId: null }),
  ]);
  const state = normalizeD0FixtureState(parameters.fixture_state);

  return (
    <DesktopShell
      activeChannel="home"
      fixtureResult={fixtureResult}
      requiresD0Fixture={false}
    >
      {/*
        视觉隐藏的页面标题。这一页的可见标题在跨路由共用的组件里，
        提成 h1 会连带改掉别的页面；而没有 h1 时，靠标题导航的人
        听到的第一句是右栏的「热股榜」。
      */}
      <h1 className="visually-hidden">首页</h1>
      {/*
        首页顶部直接能发。此前发帖只在顶栏那个入口里，想说一句话得先找到
        它——雪球把输入框摆在信息流最上面，进来就能写。
        未登录时这一块会自己变成一句登录提示，不占着一个点不动的框。
      */}
      <PostComposer variant="inline" />
      <RealFinanceHomeSummary model={financeModel} />
      {fixtureResult.status === "ready" ? (
        <>
          <section className="feed-intro" aria-labelledby="feed-heading">
            <div>
              <h2 id="feed-heading">社区内容</h2>
            </div>
          </section>
          <D0Feed
            /*
             * market_strip 那种卡也滤掉。
             *
             * 它渲染的是夹具里的虚构标的（星海智造 SYN001），每一行都链向
             * /instruments/listing_syn_0001——那条地址现在是 404；而且它把
             * 涨跌色和正号写死成上涨，不管数字是正是负。真实的市场概览
             * 已经在每一页顶部的指数条里。
             */
            cards={fixtureResult.data.feed.filter(
              (card) => card.type !== "news" && card.type !== "market_strip",
            )}
            fixture={fixtureResult.data}
            state={state}
          />
          {state === "normal" ? <HomeCommunityStream /> : null}
        </>
      ) : (
        <section aria-labelledby="feed-heading">
          <div className="feed-intro">
            <div>
              <h2 id="feed-heading">社区内容</h2>
            </div>
          </div>
          <PageState state="error" errorMessage={fixtureResult.message} />
        </section>
      )}
    </DesktopShell>
  );
}
