import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { classifySymbol } from "../lib/symbol-category";
import { getAccount, listAccounts } from "./social-store";

/*
 * 组合落盘。
 *
 * 组合此前只活在 React state 里，刷新就没了——所以个人主页上「组合」那一栏
 * 一直显示「—」。组合是用户自己创建的内容，应当跟着账号存下来。
 *
 * 单独一个文件，不塞进 social-v1.json：
 *   一是 social-store.ts 已经一千四百行，再堆下去没法读；
 *   二是两个模块各自读改写同一个 JSON，后写的会把先写的整份覆盖掉。
 */

const STORE_FILE = "portfolio-v1.json";

/** 权重是百分数，必须凑满一个完整的组合。 */
const TOTAL_WEIGHT = 100;
/** 浮点相加会有误差，留一点余量。 */
const WEIGHT_TOLERANCE = 0.01;
const MAX_HOLDINGS = 50;
const MAX_NAME = 40;
const MAX_SUMMARY = 200;

export type Holding = Readonly<{
  symbol: string;
  /** 百分数。 */
  weight: number;
}>;

export type Portfolio = Readonly<{
  createdAt: string;
  holdings: readonly Holding[];
  id: string;
  name: string;
  ownerId: string;
  summary: string;
}>;

interface PortfolioFollow {
  accountId: string;
  createdAt: string;
  portfolioId: string;
}

interface Store {
  follows: PortfolioFollow[];
  portfolios: Portfolio[];
}

const storeDirectory = (): string =>
  process.env.HUOQIU_SOCIAL_STORE_DIRECTORY ??
  resolve(process.cwd(), ".runtime/social");

const storePath = (): string => resolve(storeDirectory(), STORE_FILE);

const readStore = (): Store => {
  try {
    const parsed = JSON.parse(
      readFileSync(storePath(), "utf8"),
    ) as Partial<Store>;
    return {
      follows: Array.isArray(parsed.follows) ? parsed.follows : [],
      portfolios: Array.isArray(parsed.portfolios) ? parsed.portfolios : [],
    };
  } catch {
    return { follows: [], portfolios: [] };
  }
};

const writeStore = (store: Store): void => {
  mkdirSync(storeDirectory(), { recursive: true });
  const target = storePath();
  const temporary = `${target}.tmp`;
  // 先写临时文件再改名：中途崩掉也不会留下半份被截断的 JSON。
  writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  renameSync(temporary, target);
};

export type CreatePortfolioInput = Readonly<{
  holdings: readonly Holding[];
  name: string;
  now: string;
  ownerId: string;
  summary: string;
}>;

export type CreatePortfolioResult =
  Readonly<{ error: string }> | Readonly<{ portfolio: Portfolio }>;

/**
 * 建一个组合。
 *
 * 权重必须合计 100%：差几个百分点的组合，算出来的收益是错的，
 * 而页面上每一行看起来都很正常，错误只体现在总收益那一个数字上。
 *
 * 持仓必须是能定价的沪深标的：站内的虚构标的没有公开行情，放进来会让
 * 整个组合的收益无从算起。与其算出一个残缺的数字，不如一开始就不收。
 */
export const createPortfolio = (
  input: CreatePortfolioInput,
): CreatePortfolioResult => {
  if (getAccount(input.ownerId) === null) {
    return { error: "账号不存在。" };
  }

  const name = input.name.trim();
  if (name.length === 0 || name.length > MAX_NAME) {
    return { error: `组合名称需在 1 到 ${MAX_NAME} 个字之间。` };
  }
  const summary = input.summary.trim().slice(0, MAX_SUMMARY);

  const { holdings } = input;
  if (holdings.length === 0 || holdings.length > MAX_HOLDINGS) {
    return { error: `持仓数量需在 1 到 ${MAX_HOLDINGS} 之间。` };
  }

  const symbols = new Set<string>();
  for (const holding of holdings) {
    if (classifySymbol(holding.symbol) === "other") {
      return { error: `${holding.symbol} 没有公开行情来源，无法计入组合。` };
    }
    if (symbols.has(holding.symbol)) {
      return { error: `${holding.symbol} 重复出现。` };
    }
    symbols.add(holding.symbol);
    if (!Number.isFinite(holding.weight) || holding.weight <= 0) {
      return { error: "每一项权重都必须大于 0。" };
    }
  }

  const total = holdings.reduce((sum, holding) => sum + holding.weight, 0);
  if (Math.abs(total - TOTAL_WEIGHT) > WEIGHT_TOLERANCE) {
    return { error: `持仓权重合计需为 ${TOTAL_WEIGHT}%，当前为 ${total}%。` };
  }

  const portfolio: Portfolio = {
    createdAt: input.now,
    holdings: holdings.map((holding) => ({
      symbol: holding.symbol,
      weight: holding.weight,
    })),
    id: `pf_${randomBytes(8).toString("hex")}`,
    name,
    ownerId: input.ownerId,
    summary,
  };

  const store = readStore();
  store.portfolios.push(portfolio);
  writeStore(store);
  return { portfolio };
};

export const getPortfolio = (portfolioId: string): Portfolio | null =>
  readStore().portfolios.find((entry) => entry.id === portfolioId) ?? null;

/** 我创建的：按创建时间倒序，最新的在前。 */
export const listPortfoliosByOwner = (ownerId: string): readonly Portfolio[] =>
  readStore()
    .portfolios.filter((entry) => entry.ownerId === ownerId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

/**
 * 关注/取消关注别人的组合。
 *
 * 关注一个不存在的组合不会留下任何记录——否则「我关注的」里会凭空多出
 * 一行点不开的东西。
 */
export const setPortfolioFollow = (
  accountId: string,
  portfolioId: string,
  followed: boolean,
): void => {
  const store = readStore();
  const exists = store.portfolios.some((entry) => entry.id === portfolioId);
  if (!exists) return;

  const others = store.follows.filter(
    (entry) =>
      entry.accountId !== accountId || entry.portfolioId !== portfolioId,
  );
  writeStore({
    follows: followed
      ? [
          ...others,
          { accountId, createdAt: new Date().toISOString(), portfolioId },
        ]
      : others,
    portfolios: store.portfolios,
  });
};

/** 我关注的。关注别人的组合不会让它出现在「我创建的」里。 */
export const listFollowedPortfolios = (
  accountId: string,
): readonly Portfolio[] => {
  const store = readStore();
  const followed = new Set(
    store.follows
      .filter((entry) => entry.accountId === accountId)
      .map((entry) => entry.portfolioId),
  );
  return store.portfolios.filter((entry) => followed.has(entry.id));
};

/** 榜单上的一条：组合本身，加上「谁建的」和「多少人关注」。 */
export type PublicPortfolio = Portfolio &
  Readonly<{ followerCount: number; ownerName: string }>;

/**
 * 组合榜：本站账号真实建过的全部组合，最新的在前。
 *
 * 榜单此前列的是十二条写死的样本组合，带着编好的收益数字，而站内真实存在的
 * 组合一条也不在上面。没有人建过组合时这里返回空数组——那也是实话，
 * 比十二条凭空出现的组合诚实。
 *
 * 账号名现查不落盘：写死一个名字的话，改了昵称之后榜单上还挂着旧的。
 */
export const listPublicPortfolios = (): readonly PublicPortfolio[] => {
  const store = readStore();
  if (store.portfolios.length === 0) return [];

  /*
   * 关注数先按组合汇总一次。每条组合各自过一遍 follows，
   * 组合和关注都多起来之后就是 O(n×m)。
   */
  const followers = new Map<string, number>();
  for (const follow of store.follows) {
    followers.set(
      follow.portfolioId,
      (followers.get(follow.portfolioId) ?? 0) + 1,
    );
  }

  /*
   * 账号也只读一次。getAccount 每次都会把整份社交库读进来，
   * 逐条调用等于把同一个文件读上几十遍。
   */
  const names = new Map(
    listAccounts().map((account) => [account.id, account.displayName]),
  );

  return store.portfolios
    .map((portfolio) => ({
      ...portfolio,
      followerCount: followers.get(portfolio.id) ?? 0,
      // 账号查不到时留空，由页面决定怎么写，不在这里编一个名字出来。
      ownerName: names.get(portfolio.ownerId) ?? "",
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
};

export const isPortfolioFollowed = (
  accountId: string,
  portfolioId: string,
): boolean =>
  readStore().follows.some(
    (entry) =>
      entry.accountId === accountId && entry.portfolioId === portfolioId,
  );
