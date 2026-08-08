import { InstrumentSearch } from "../../components/instrument/instrument-search";
import { DesktopShell } from "../../components/shell/desktop-shell";
import { loadD0Fixture } from "../../lib/d0-fixture";
import { normalizeD0FixtureState } from "../../lib/d0-page-state";

type SearchPageProperties = Readonly<{
  searchParams: Promise<
    Readonly<{
      fixture_state?: string | readonly string[];
      q?: string | readonly string[];
    }>
  >;
}>;

const normalizeQueryParameter = (
  value: string | readonly string[] | undefined,
): string => {
  const query = Array.isArray(value) ? value[0] : value;
  return typeof query === "string" ? query.slice(0, 128) : "";
};

export default async function SearchPage({
  searchParams,
}: SearchPageProperties) {
  const fixtureResult = loadD0Fixture();
  const resolvedSearchParameters = await searchParams;
  const query = normalizeQueryParameter(resolvedSearchParameters.q);
  const state = normalizeD0FixtureState(resolvedSearchParameters.fixture_state);

  return (
    <DesktopShell fixtureResult={fixtureResult}>
      {fixtureResult.status === "ready" ? (
        <InstrumentSearch
          fixture={fixtureResult.data}
          query={query}
          state={state}
        />
      ) : null}
    </DesktopShell>
  );
}
