import { initContract } from "@ts-rest/core";
import { z } from "zod";

import {
  commonErrorResponses,
  idempotencyHeaderSchema,
  requestMetaSchema,
  resourceIdSchema,
  timestampSchema,
  versionStringSchema,
} from "./common.js";

const c = initContract();

export const actorRoleSchema = z.enum([
  "user",
  "creator",
  "operator",
  "reviewer",
  "admin",
]);

export const authTransportSchema = z.enum(["cookie", "bearer"]);

export const actorSchema = z
  .object({
    actor_id: resourceIdSchema,
    display_name: z.string().min(1).max(80),
    roles: z.array(actorRoleSchema).min(1),
    consent_version: versionStringSchema,
  })
  .strict();

export const sessionViewSchema = z
  .object({
    actor: actorSchema,
    transport: authTransportSchema,
    expires_at: timestampSchema,
  })
  .strict();

const registerBodySchema = z
  .object({
    invite_code: z.string().min(8).max(256),
    email: z.string().email(),
    password: z.string().min(12).max(256),
    display_name: z.string().min(1).max(80),
  })
  .strict();

const loginBodySchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1).max(256),
    transport: authTransportSchema,
  })
  .strict();

const logoutBodySchema = z
  .object({
    device_binding_id: resourceIdSchema.optional(),
  })
  .strict();

const sessionResponseSchema = requestMetaSchema.extend({
  session: sessionViewSchema,
});

export const authContract = c.router({
  authRegister: {
    method: "POST",
    path: "/v1/auth/register",
    headers: idempotencyHeaderSchema,
    body: registerBodySchema,
    responses: {
      201: sessionResponseSchema,
      ...commonErrorResponses,
    },
    summary: "Register an invited Alpha actor",
  },
  authLogin: {
    method: "POST",
    path: "/v1/auth/login",
    headers: idempotencyHeaderSchema,
    body: loginBodySchema,
    responses: {
      200: sessionResponseSchema,
      ...commonErrorResponses,
    },
    summary: "Start an actor session using cookie or bearer transport",
  },
  authGetSession: {
    method: "GET",
    path: "/v1/auth/session",
    responses: {
      200: sessionResponseSchema,
      ...commonErrorResponses,
    },
    summary: "Read the current actor session",
  },
  authLogout: {
    method: "POST",
    path: "/v1/auth/logout",
    headers: idempotencyHeaderSchema,
    body: logoutBodySchema,
    responses: {
      200: requestMetaSchema.extend({ revoked: z.literal(true) }),
      ...commonErrorResponses,
    },
    summary: "Revoke the current actor session and device binding",
  },
});
