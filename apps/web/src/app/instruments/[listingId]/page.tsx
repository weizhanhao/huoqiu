import { PriceChart } from "../../../components/instrument/price-chart";
import { QuoteHeader } from "../../../components/instrument/quote-header";
import { DesktopShell } from "../../../components/shell/desktop-shell";
import { UnavailableAction } from "../../../components/shell/unavailable-action";
import { PageState } from "../../../components/system/page-state";
import { SyntheticInstrumentDetail } from "../../../features/market-portfolio/synthetic-instrument-detail";
import { syntheticListings } from "../../../features/market-portfolio/synthetic-data";
import { loadD0Fixture } from "../../../lib/d0-fixture";
import { normalizeD0FixtureState } from "../../../lib/d0-page-state";

type InstrumentPageProperties = Readonly<{
  params: Promise<Readonly<{ listingId: string }>>;
  searchParams: Promise<
    Readonly<{ fixture_state?: string | readonly string[] }>
  >;
}>;

export const generateStaticParams = () => {
  const result = loadD0Fixture();
  const fixtureParams =
    result.status === "ready"
      ? result.data.instruments.map((instrument) => ({
          listingId: instrument.listing_id,
        }))
      : [];
  return [
    ...fixtureParams,
    ...syntheticListings.map((listing) => ({ listingId: listing.listingId })),
  ].filter(
    (candidate, index, entries) =>
      entries.findIndex((entry) => entry.listingId === candidate.listingId) ===
      index,
  );
};

export default async function InstrumentPage({
  params,
  searchParams,
}: InstrumentPageProperties) {
  const fixtureResult = loadD0Fixture();
  const { listingId } = await params;
  const state = normalizeD0FixtureState((await searchParams).fixture_state);

  if (fixtureResult.status !== "ready") {
    return <DesktopShell fixtureResult={fixtureResult}>{null}</DesktopShell>;
  }

  const instrument = fixtureResult.data.instruments.find(
    (candidate) => candidate.listing_id === listingId,
  );
  const quote = fixtureResult.data.quotes.find(
    (candidate) => candidate.listing_id === listingId,
  );
  const series = fixtureResult.data.bars.find(
    (candidate) => candidate.listing_id === listingId,
  );
  const syntheticListing = syntheticListings.find(
    (candidate) => candidate.listingId === listingId,
  );

  return (
    <DesktopShell fixtureResult={fixtureResult}>
      {state !== "normal" ? (
        <PageState
          state={state}
          emptyMessage="暂无演示标的详情"
          errorMessage="演示标的详情暂时不可用"
        />
      ) : instrument === undefined || quote === undefined ? (
        syntheticListing === undefined ? (
          <PageState state="empty" emptyMessage="没有这个演示标的" />
        ) : (
          <SyntheticInstrumentDetail listing={syntheticListing} />
        )
      ) : (
        <div className="instrument-detail">
          <QuoteHeader instrument={instrument} quote={quote} />
          <nav className="instrument-tabs" aria-label="标的详情频道">
            <span aria-current="page">走势</span>
            <UnavailableAction label="演示说明" />
          </nav>
          <PriceChart
            instrumentName={instrument.name}
            points={series?.points ?? []}
            state="normal"
          />
          <aside className="instrument-disclosure">
            <strong>演示数据说明</strong>
            <p>
              本页只读取 huoqiu-synthetic
              固定快照，不连接真实行情，不提供投资建议或交易能力。
            </p>
          </aside>
        </div>
      )}
    </DesktopShell>
  );
}
