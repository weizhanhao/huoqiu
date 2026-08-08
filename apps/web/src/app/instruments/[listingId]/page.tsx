import { PriceChart } from "../../../components/instrument/price-chart";
import { QuoteHeader } from "../../../components/instrument/quote-header";
import { DesktopShell } from "../../../components/shell/desktop-shell";
import { PageState } from "../../../components/system/page-state";
import { loadD0Fixture } from "../../../lib/d0-fixture";

type InstrumentPageProperties = Readonly<{
  params: Promise<Readonly<{ listingId: string }>>;
}>;

export const generateStaticParams = () => {
  const result = loadD0Fixture();
  return result.status === "ready"
    ? result.data.instruments.map((instrument) => ({
        listingId: instrument.listing_id,
      }))
    : [];
};

export default async function InstrumentPage({
  params,
}: InstrumentPageProperties) {
  const fixtureResult = loadD0Fixture();
  const { listingId } = await params;

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

  return (
    <DesktopShell fixtureResult={fixtureResult}>
      {instrument === undefined || quote === undefined ? (
        <PageState state="empty" emptyMessage="没有这个演示标的" />
      ) : (
        <div className="instrument-detail">
          <QuoteHeader instrument={instrument} quote={quote} />
          <nav className="instrument-tabs" aria-label="标的详情频道">
            <span aria-current="page">走势</span>
            <span>演示说明</span>
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
