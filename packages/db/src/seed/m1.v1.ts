import rawM1Fixture from "@huoqiu/contracts/m1/fixture-data" with { type: "json" };
import { m1FixtureSchema, type M1Fixture } from "@huoqiu/contracts/m1/fixture";
import type postgres from "postgres";

export interface M1SeedResult {
  readonly exchanges: 1;
  readonly feedChannels: 4;
  readonly identityProfiles: 2;
  readonly identityUsers: 2;
  readonly instruments: 1;
  readonly listings: 1;
  readonly persistedCards: 0;
}

export interface SeedM1Options {
  readonly createClient: (() => postgres.Sql) | (() => Promise<postgres.Sql>);
}

type SeedTransaction = postgres.TransactionSql;
type Comparable = boolean | null | number | string | readonly string[];

const sameValue = (actual: unknown, expected: Comparable): boolean =>
  JSON.stringify(actual) === JSON.stringify(expected);

const verifyStableRow = async (
  transaction: SeedTransaction,
  tableName: string,
  id: string,
  expected: Readonly<Record<string, Comparable>>,
): Promise<void> => {
  const rows = await transaction.unsafe<Record<string, unknown>[]>(
    `select * from "${tableName}" where id = $1`,
    [id],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`SEED_READBACK_MISSING ${tableName}#${id}`);
  }
  for (const [field, value] of Object.entries(expected)) {
    if (!sameValue(row[field], value)) {
      throw new Error(
        `SEED_CONFLICT ${tableName}#${id} field=${field} expected=${JSON.stringify(value)} actual=${JSON.stringify(row[field])}`,
      );
    }
  }
};

const seedIdentities = async (
  transaction: SeedTransaction,
  fixture: M1Fixture,
): Promise<void> => {
  for (const [index, employee] of fixture.identities.employees.entries()) {
    const suffix = String(index + 1).padStart(4, "0");
    const userId = `identity_user_syn_${suffix}`;
    const profileId = `identity_profile_syn_${suffix}`;
    const roles = [...employee.roles];
    await transaction`
      insert into identity_users
        (id, subject, normalized_email, status, roles)
      values
        (${userId}, ${employee.subject_id}, ${null}, 'active', ${transaction.json(roles)})
      on conflict (id) do nothing
    `;
    await verifyStableRow(transaction, "identity_users", userId, {
      id: userId,
      normalized_email: null,
      roles,
      status: "active",
      subject: employee.subject_id,
    });

    await transaction`
      insert into identity_profiles
        (id, user_id, display_name, bio, avatar_url)
      values
        (${profileId}, ${userId}, ${employee.display_alias}, ${null}, ${null})
      on conflict (id) do nothing
    `;
    await verifyStableRow(transaction, "identity_profiles", profileId, {
      avatar_url: null,
      bio: null,
      display_name: employee.display_alias,
      id: profileId,
      user_id: userId,
    });
  }
};

const seedInstrumentRegistry = async (
  transaction: SeedTransaction,
  fixture: M1Fixture,
): Promise<void> => {
  const { exchange, instrument, listing } = fixture.market;
  await transaction`
    insert into exchanges (id, code, name, market, timezone)
    values (
      ${exchange.exchange_id}, ${exchange.code}, ${exchange.display_label},
      'SYNTHETIC', ${exchange.timezone}
    )
    on conflict (id) do nothing
  `;
  await verifyStableRow(transaction, "exchanges", exchange.exchange_id, {
    code: exchange.code,
    id: exchange.exchange_id,
    market: "SYNTHETIC",
    name: exchange.display_label,
    timezone: exchange.timezone,
  });

  const aliases = [...instrument.aliases];
  await transaction`
    insert into instruments
      (id, name, name_pinyin, aliases, instrument_type, currency, status)
    values (
      ${instrument.instrument_id}, ${instrument.display_label},
      ${instrument.name_pinyin}, ${transaction.json(aliases)},
      ${instrument.instrument_type}, ${listing.currency}, 'active'
    )
    on conflict (id) do nothing
  `;
  await verifyStableRow(transaction, "instruments", instrument.instrument_id, {
    aliases,
    currency: listing.currency,
    id: instrument.instrument_id,
    instrument_type: instrument.instrument_type,
    name: instrument.display_label,
    name_pinyin: instrument.name_pinyin,
    status: "active",
  });

  const symbolAliases = [...listing.symbol_aliases];
  await transaction`
    insert into listings
      (id, instrument_id, exchange_id, market, symbol, symbol_aliases, currency, status)
    values (
      ${listing.listing_id}, ${listing.instrument_id}, ${listing.exchange_id},
      'SYNTHETIC', ${listing.symbol}, ${transaction.json(symbolAliases)},
      ${listing.currency}, ${listing.status}
    )
    on conflict (id) do nothing
  `;
  await verifyStableRow(transaction, "listings", listing.listing_id, {
    currency: listing.currency,
    exchange_id: listing.exchange_id,
    id: listing.listing_id,
    instrument_id: listing.instrument_id,
    market: "SYNTHETIC",
    status: listing.status,
    symbol: listing.symbol,
    symbol_aliases: symbolAliases,
  });
};

const channelTitles: Readonly<Record<string, string>> = {
  following: "关注",
  home: "首页",
  market: "行情",
  news: "资讯",
};

const seedChannels = async (
  transaction: SeedTransaction,
  fixture: M1Fixture,
): Promise<void> => {
  for (const channel of fixture.registries.channels) {
    const title = channelTitles[channel.channel_id];
    if (title === undefined) {
      throw new Error(`SEED_CHANNEL_TITLE_MISSING:${channel.channel_id}`);
    }
    await transaction`
      insert into feed_channels (id, key, title, enabled)
      values (${channel.channel_id}, ${channel.channel_id}, ${title}, true)
      on conflict (id) do nothing
    `;
    await verifyStableRow(transaction, "feed_channels", channel.channel_id, {
      enabled: true,
      id: channel.channel_id,
      key: channel.channel_id,
      title,
    });
  }
};

export const seedM1Fixture = async (
  rawFixture: unknown,
  options: SeedM1Options,
): Promise<M1SeedResult> => {
  // This parse is intentionally before the client factory: invalid fixtures
  // cannot open a socket, issue a query, or begin a transaction.
  const fixture = m1FixtureSchema.parse(rawFixture);
  const sql = await options.createClient();

  return sql.begin(async (transaction) => {
    await seedIdentities(transaction, fixture);
    await seedInstrumentRegistry(transaction, fixture);
    await seedChannels(transaction, fixture);
    return {
      exchanges: 1,
      feedChannels: 4,
      identityProfiles: 2,
      identityUsers: 2,
      instruments: 1,
      listings: 1,
      persistedCards: 0,
    };
  });
};

export const seedM1 = (options: SeedM1Options): Promise<M1SeedResult> =>
  seedM1Fixture(rawM1Fixture, options);
