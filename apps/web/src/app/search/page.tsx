import { InstrumentSearch } from "../../components/instrument/instrument-search";
import { DesktopShell } from "../../components/shell/desktop-shell";
import { loadD0Fixture } from "../../lib/d0-fixture";

type SearchPageProperties = Readonly<{
  searchParams: Promise<Readonly<{ q?: string | readonly string[] }>>;
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
  const query = normalizeQueryParameter((await searchParams).q);

  return (
    <DesktopShell fixtureResult={fixtureResult}>
      {fixtureResult.status === "ready" ? (
        <InstrumentSearch
          fixture={fixtureResult.data}
          query={query}
          state="normal"
        />
      ) : null}
    </DesktopShell>
  );
}
