import { initContract } from "@ts-rest/core";
import { z } from "zod";

import {
  actorRoleSchema,
  actorSchema,
  authLoginBodySchema,
  authLogoutBodySchema,
  authRegisterBodySchema,
  authSessionResponseSchema,
  authTransportSchema,
  sessionViewSchema,
} from "./auth.schemas.js";
import {
  commonErrorResponses,
  idempotencyHeaderSchema,
  requestMetaSchema,
} from "./common.js";

const c = initContract();

export {
  actorRoleSchema,
  actorSchema,
  authLoginBodySchema,
  authLogoutBodySchema,
  authRegisterBodySchema,
  authSessionResponseSchema,
  authTransportSchema,
  sessionViewSchema,
};

export const authContract = c.router({
  authRegister: {
    method: "POST",
    path: "/v1/auth/register",
    headers: idempotencyHeaderSchema,
    body: authRegisterBodySchema,
    responses: {
      201: authSessionResponseSchema,
      ...commonErrorResponses,
    },
    summary: "Register an invited Alpha actor",
  },
  authLogin: {
    method: "POST",
    path: "/v1/auth/login",
    headers: idempotencyHeaderSchema,
    body: authLoginBodySchema,
    responses: {
      200: authSessionResponseSchema,
      ...commonErrorResponses,
    },
    summary: "Start an actor session using cookie or bearer transport",
  },
  authGetSession: {
    method: "GET",
    path: "/v1/auth/session",
    responses: {
      200: authSessionResponseSchema,
      ...commonErrorResponses,
    },
    summary: "Read the current actor session",
  },
  authLogout: {
    method: "POST",
    path: "/v1/auth/logout",
    headers: idempotencyHeaderSchema,
    body: authLogoutBodySchema,
    responses: {
      200: requestMetaSchema.extend({ revoked: z.literal(true) }),
      ...commonErrorResponses,
    },
    summary: "Revoke the current actor session and device binding",
  },
});
