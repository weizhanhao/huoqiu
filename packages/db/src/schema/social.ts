import {
  boolean,
  pgTable,
  text,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { aggregateVersion, createdAt, textId, updatedAt } from "./_shared.js";

export const socialComments = pgTable("social_comments", {
  id: textId(),
  postId: text("post_id").notNull(),
  authorId: text("author_id").notNull(),
  parentCommentId: text("parent_comment_id").references(
    (): AnyPgColumn => socialComments.id,
    { onDelete: "set null" },
  ),
  body: text("body").notNull(),
  status: text("status").default("submitted").notNull(),
  version: aggregateVersion(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const socialReactions = pgTable(
  "social_reactions",
  {
    id: textId(),
    actorId: text("actor_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reactionType: text("reaction_type").notNull(),
    active: boolean("active").default(true).notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("social_reactions_actor_target_type_unique").on(
      table.actorId,
      table.targetType,
      table.targetId,
      table.reactionType,
    ),
  ],
);

export const socialFollows = pgTable(
  "social_follows",
  {
    id: textId(),
    followerId: text("follower_id").notNull(),
    followeeId: text("followee_id").notNull(),
    active: boolean("active").default(true).notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("social_follows_actor_target_unique").on(
      table.followerId,
      table.followeeId,
    ),
  ],
);

export const socialBookmarks = pgTable(
  "social_bookmarks",
  {
    id: textId(),
    actorId: text("actor_id").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    active: boolean("active").default(true).notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("social_bookmarks_actor_target_unique").on(
      table.actorId,
      table.targetType,
      table.targetId,
    ),
  ],
);

export const socialBlocks = pgTable(
  "social_blocks",
  {
    id: textId(),
    blockerId: text("blocker_id").notNull(),
    blockedId: text("blocked_id").notNull(),
    active: boolean("active").default(true).notNull(),
    version: aggregateVersion(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("social_blocks_actor_target_unique").on(
      table.blockerId,
      table.blockedId,
    ),
  ],
);
