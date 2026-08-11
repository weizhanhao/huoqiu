import { cssVariables } from "@huoqiu/web-ui";
import { createRoot } from "react-dom/client";

import { DesktopShell } from "../../../src/components/shell/desktop-shell";
import { FinanceBriefingTimeline } from "../../../src/features/finance-information/finance-briefing-timeline";
import { FinanceInformationDetail } from "../../../src/features/finance-information/finance-information-detail";
import {
  financeInformationChannels,
  getFinanceInformationById,
  type FinanceInformationChannel,
} from "../../../src/features/finance-information/finance-information-fixtures";
import { FinanceInformationHub } from "../../../src/features/finance-information/finance-information-hub";

import "../../../src/app/globals.css";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("Expected the finance information browser harness root");
}

const query = new URLSearchParams(window.location.search);
const requestedChannel = query.get("channel");
const initialChannel: FinanceInformationChannel =
  financeInformationChannels.some((channel) => channel.id === requestedChannel)
    ? (requestedChannel as FinanceInformationChannel)
    : "all";
const detailPrefix = "/news/";
const newsId = window.location.pathname.startsWith(detailPrefix)
  ? window.location.pathname.slice(detailPrefix.length)
  : "";
const detailItem = getFinanceInformationById(newsId);

const surface =
  window.location.pathname === "/7x24" ? (
    <FinanceBriefingTimeline />
  ) : detailItem === undefined ? (
    <FinanceInformationHub
      initialChannel={initialChannel}
      initialQuery={query.get("q") ?? ""}
    />
  ) : (
    <FinanceInformationDetail item={detailItem} />
  );

createRoot(root).render(
  <>
    <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
    <DesktopShell>{surface}</DesktopShell>
  </>,
);
