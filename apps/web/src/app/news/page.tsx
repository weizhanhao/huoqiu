import { DesktopShell } from "../../components/shell/desktop-shell";
import { FinanceInformationHub } from "../../features/finance-information/finance-information-hub";
import {
  financeInformationChannels,
  type FinanceInformationChannel,
} from "../../features/finance-information/finance-information-fixtures";

type NewsPageProperties = Readonly<{
  searchParams: Promise<
    Readonly<{
      channel?: string | readonly string[] | undefined;
      q?: string | readonly string[] | undefined;
    }>
  >;
}>;

const normalizeChannel = (
  value: string | readonly string[] | undefined,
): FinanceInformationChannel => {
  const candidate = Array.isArray(value) ? value[0] : value;
  return financeInformationChannels.some((channel) => channel.id === candidate)
    ? (candidate as FinanceInformationChannel)
    : "all";
};

export default async function NewsPage({ searchParams }: NewsPageProperties) {
  const resolvedSearchParams = await searchParams;
  const channel = normalizeChannel(resolvedSearchParams.channel);
  const query = Array.isArray(resolvedSearchParams.q)
    ? (resolvedSearchParams.q[0] ?? "")
    : (resolvedSearchParams.q ?? "");

  return (
    <DesktopShell>
      <FinanceInformationHub initialChannel={channel} initialQuery={query} />
    </DesktopShell>
  );
}
