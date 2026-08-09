import { z } from "zod";

import { safeDeepLinkSchema } from "./common.js";

const syntheticSourceSchema = z.literal("huoqiu-synthetic");

const approvedSurfacesSchema = z.tuple([
  z.literal("identity"),
  z.literal("instrument"),
  z.literal("market_data"),
  z.literal("feed"),
  z.literal("watchlist"),
  z.literal("content"),
  z.literal("social"),
  z.literal("notification"),
  z.literal("moderation"),
  z.literal("portfolio_private"),
]);

const reviewerEmployeeSchema = z
  .object({
    subject_id: z.literal("subject_syn_0001"),
    display_alias: z.literal("合成员工甲"),
    roles: z.tuple([z.literal("Reviewer")]),
    alpha_access: z.literal(true),
    source: syntheticSourceSchema,
  })
  .strict();

const operatorEmployeeSchema = z
  .object({
    subject_id: z.literal("subject_syn_0002"),
    display_alias: z.literal("合成员工乙"),
    roles: z.tuple([z.literal("Operator")]),
    alpha_access: z.literal(true),
    source: syntheticSourceSchema,
  })
  .strict();

const channelSchema = <ChannelId extends string, Surface extends string>(
  channelId: ChannelId,
  surface: Surface,
) =>
  z
    .object({
      channel_id: z.literal(channelId),
      surface: z.literal(surface),
      source: syntheticSourceSchema,
    })
    .strict();

const cardSchema = <
  CardType extends string,
  ChannelIds extends readonly [string, ...string[]],
>(
  cardType: CardType,
  channelIds: ChannelIds,
) =>
  z
    .object({
      card_type: z.literal(cardType),
      schema_version: z.literal(1),
      allowed_channel_ids: z.tuple(
        channelIds.map((channelId) => z.literal(channelId)) as [
          z.ZodLiteral<ChannelIds[0]>,
          ...z.ZodLiteral<ChannelIds[number]>[],
        ],
      ),
      deep_link: safeDeepLinkSchema,
      source: syntheticSourceSchema,
    })
    .strict();

export const m1FixtureSchema = z
  .object({
    version: z.literal("m1.v1"),
    mode: z.literal("fixture"),
    source: syntheticSourceSchema,
    as_of: z.literal("2026-08-08T08:00:00.000Z"),
    surfaces: approvedSurfacesSchema,
    identities: z
      .object({
        employees: z.tuple([reviewerEmployeeSchema, operatorEmployeeSchema]),
      })
      .strict(),
    market: z
      .object({
        exchange: z
          .object({
            exchange_id: z.literal("exchange_syn_0001"),
            code: z.literal("SYNX"),
            display_label: z.literal("火球合成交易所"),
            timezone: z.literal("Asia/Shanghai"),
            source: syntheticSourceSchema,
          })
          .strict(),
        instrument: z
          .object({
            instrument_id: z.literal("instrument_syn_0001"),
            instrument_type: z.literal("equity"),
            display_label: z.literal("合成示例一号"),
            source: syntheticSourceSchema,
          })
          .strict(),
        listing: z
          .object({
            listing_id: z.literal("listing_syn_0001"),
            instrument_id: z.literal("instrument_syn_0001"),
            exchange_id: z.literal("exchange_syn_0001"),
            symbol: z.literal("SYN001"),
            currency: z.literal("CNY"),
            status: z.literal("open"),
            source: syntheticSourceSchema,
          })
          .strict(),
      })
      .strict(),
    registries: z
      .object({
        default_channel_id: z.literal("home"),
        channels: z.tuple([
          channelSchema("home", "feed"),
          channelSchema("following", "feed"),
          channelSchema("market", "market_data"),
          channelSchema("news", "content"),
        ]),
        cards: z.tuple([
          cardSchema("post", ["home", "following"]),
          cardSchema("news", ["home", "news"]),
          cardSchema("market_strip", ["home", "market"]),
          cardSchema("topic", ["home"]),
          cardSchema("ops_banner", ["home"]),
        ]),
      })
      .strict(),
  })
  .strict();

export type M1Fixture = z.infer<typeof m1FixtureSchema>;
