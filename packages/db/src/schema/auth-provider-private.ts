import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { createdAt, textId, updatedAt } from "./_shared.js";

/**
 * Provider-private tables audited against Better Auth 1.6.26
 * `@better-auth/core/dist/db/get-tables.mjs`. Only the provider adapter may
 * import this leaf; it is deliberately absent from the public schema index.
 */
export const authUsers = pgTable(
  "auth_users",
  {
    id: textId(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("auth_users_email_unique").on(table.email)],
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: textId(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    token: text("token").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("auth_sessions_token_unique").on(table.token),
    index("auth_sessions_user_idx").on(table.userId),
  ],
);

export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: textId(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      mode: "date",
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      mode: "date",
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("auth_accounts_provider_account_unique").on(
      table.providerId,
      table.accountId,
    ),
    index("auth_accounts_user_idx").on(table.userId),
  ],
);

export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: textId(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)],
);

export const authProviderPrivateSchema = {
  auth_accounts: authAccounts,
  auth_sessions: authSessions,
  auth_users: authUsers,
  auth_verifications: authVerifications,
} as const;

export const betterAuthDatabaseMapping = {
  account: {
    modelName: "auth_accounts",
  },
  session: {
    modelName: "auth_sessions",
  },
  user: {
    modelName: "auth_users",
  },
  verification: {
    modelName: "auth_verifications",
  },
} as const;
