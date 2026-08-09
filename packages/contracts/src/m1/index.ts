import { m1Router } from "./router.js";

export {
  actorRoles,
  m1OperationRegistry,
  type ActorRole,
  type M1OperationRegistration,
} from "./operation-registry.js";
export {
  notificationSseDataSchema,
  notificationSseFrameBatchSchema,
  notificationSseWireSchema,
} from "./notification-moderation.contract.js";
export { m1Router };

export type AppRouter = typeof m1Router;
export type M1AppRouter = AppRouter;
