import { cssVariables } from "@huoqiu/web-ui";
import { createRoot } from "react-dom/client";

import {
  RealFinanceBriefing,
  RealFinanceDetail,
  RealFinanceHub,
  type FinancePublicState,
} from "../../../src/features/real-finance";
import { denseFinanceModel } from "../real-finance-test-model";

import "../../../src/app/globals.css";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("Expected the real finance browser harness root");
}

const query = new URLSearchParams(window.location.search);
const requestedState = query.get("state");
const states: readonly FinancePublicState[] = [
  "ready",
  "empty",
  "degraded",
  "stale",
  "missing",
  "invalid",
];
const state = states.includes(requestedState as FinancePublicState)
  ? (requestedState as FinancePublicState)
  : "ready";
const selectedRecordId =
  query.get("record") ?? denseFinanceModel.selectedRecordId;
const model = { ...denseFinanceModel, selectedRecordId, state };

const surface =
  window.location.pathname === "/briefing" ? (
    <RealFinanceBriefing model={model} />
  ) : window.location.pathname === "/detail" ? (
    <RealFinanceDetail model={model} />
  ) : (
    <RealFinanceHub model={model} />
  );

createRoot(root).render(
  <>
    <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
    <div
      style={{
        margin: "0 auto",
        maxWidth: "1180px",
        padding: "24px clamp(12px, 3vw, 32px) 64px",
      }}
    >
      {surface}
    </div>
  </>,
);
