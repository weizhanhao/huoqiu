import type {
  AppRoute,
  ClientInferRequest,
  ClientInferResponses,
} from "@ts-rest/core";
import { approvedEventTypes } from "@huoqiu/contracts/events";
import type { AppRouter } from "@huoqiu/contracts/m1";

export const contractVersion = "m1.v1" as const;
export const m1ApiIds = [
  "API-AUTH-001",
  "API-AUTH-002",
  "API-AUTH-003",
  "API-AUTH-004",
  "API-INST-001",
  "API-INST-002",
  "API-MD-001",
  "API-MD-002",
  "API-FEED-001",
  "API-WATCH-001",
  "API-WATCH-002",
  "API-WATCH-003",
  "API-POST-001",
  "API-POST-002",
  "API-COMMENT-000",
  "API-COMMENT-001",
  "API-REACTION-001",
  "API-REACTION-002",
  "API-NOTIF-001",
  "API-NOTIF-002",
  "API-NOTIF-003",
  "API-REPORT-001",
  "API-MOD-001",
  "API-MOD-002",
  "API-PORT-000",
  "API-PORT-001",
  "API-PORT-002",
  "API-PORT-003",
  "API-PORT-004",
  "API-PORT-005",
  "API-PORT-006",
] as const;
export { approvedEventTypes as m1EventTypes };

export type HuoqiuAppRouter = AppRouter;
export type HuoqiuOperationName = keyof AppRouter;
export type HuoqiuOperationRequest<Name extends HuoqiuOperationName> =
  AppRouter[Name] extends AppRoute
    ? ClientInferRequest<AppRouter[Name]>
    : never;
export type HuoqiuOperationResponse<Name extends HuoqiuOperationName> =
  AppRouter[Name] extends AppRoute
    ? ClientInferResponses<AppRouter[Name]>
    : never;
export type M1ApiId = (typeof m1ApiIds)[number];
export type M1EventType = (typeof approvedEventTypes)[number];
