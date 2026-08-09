import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";

import { aggregateVersion, createdAt, textId, updatedAt } from "./_shared.js";

export const identityUsers = pgTable(
  "identity_users",
  {
    id: textId(),
    subject: text("subject").notNull(),
    normalizedEmail: text("normalized_email"),
    status: text("status").default("active").notNull(),
    roles: jsonb("roles").$type<readonly string[]>().default([]).notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("identity_users_subject_unique").on(table.subject),
    uniqueIndex("identity_users_normalized_email_unique")
      .on(table.normalizedEmail)
      .where(sql`${table.normalizedEmail} is not null`),
  ],
);

export const identityProfiles = pgTable(
  "identity_profiles",
  {
    id: textId(),
    userId: text("user_id")
      .notNull()
      .references(() => identityUsers.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    bio: text("bio"),
    avatarUrl: text("avatar_url"),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("identity_profiles_user_unique").on(table.userId)],
);
