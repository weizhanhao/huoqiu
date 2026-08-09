import { z } from "zod";

import {
  requestMetaSchema,
  resourceIdSchema,
  timestampSchema,
  versionStringSchema,
} from "./common.js";

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

export const authRegisterBodySchema = z
  .object({
    invite_code: z.string().min(8).max(256),
    email: z.string().email(),
    password: z.string().min(12).max(256),
    display_name: z.string().min(1).max(80),
  })
  .strict();

export const authLoginBodySchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1).max(256),
    transport: authTransportSchema,
  })
  .strict();

export const authLogoutBodySchema = z
  .object({
    device_binding_id: resourceIdSchema.optional(),
  })
  .strict();

export const authSessionResponseSchema = requestMetaSchema.extend({
  session: sessionViewSchema,
});
