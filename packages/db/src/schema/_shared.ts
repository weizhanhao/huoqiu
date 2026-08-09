import { bigint, numeric, text, timestamp } from "drizzle-orm/pg-core";

export const textId = (name = "id") => text(name).primaryKey();

export const createdAt = () =>
  timestamp("created_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull();

export const updatedAt = () =>
  timestamp("updated_at", { mode: "date", withTimezone: true })
    .defaultNow()
    .notNull();

export const aggregateVersion = () =>
  bigint("version", { mode: "bigint" }).default(1n).notNull();

export const decimal = <Name extends string>(name: Name) =>
  numeric(name, { precision: 38, scale: 18 }).notNull();

export const optionalDecimal = <Name extends string>(name: Name) =>
  numeric(name, { precision: 38, scale: 18 });

export const bigintCounter = <Name extends string>(name: Name) =>
  bigint(name, { mode: "bigint" }).notNull();
