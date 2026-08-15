import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * 模拟交易的账本。
 *
 * 雪球的「交易」是券商对接：需要牌照、需要真实资金通道。那个做不了，
 * 也不该假装做——摆一个点不动的「开户」按钮，正是这一轮一直在清理的东西。
 *
 * 但雪球同样有「模拟交易」，而那个是能真做的：价格用真实行情，盈亏照真实
 * 价格算，只有钱是虚拟的。这一份做的就是它。
 *
 * 账本只存委托流水，持仓由流水推导。这样「为什么是这个成本价」永远能被
 * 追溯到具体哪几笔——存一份算好的持仓，一旦和流水对不上就再也说不清。
 *
 * 成交价这一层不去取，由调用方传进来；而调用方（路由）必须自己去行情接口
 * 取当前价，绝不能用客户端提交的价格——否则「1 块钱买茅台」就成立了。
 */

const STORE_FILE = "paper-trading.json";

/** A 股按手交易，一手 100 股。 */
export const LOT_SIZE = 100;

export type OrderSide = "buy" | "sell";

export type Order = Readonly<{
  /** ISO 时间戳。 */
  at: string;
  id: string;
  /** 成交价，由服务端从行情接口取得。 */
  price: number;
  shares: number;
  side: OrderSide;
  symbol: string;
}>;

export type Position = Readonly<{
  /** 加权平均成本。 */
  averageCost: number;
  shares: number;
  symbol: string;
}>;

type StoredOrder = Order & { accountId: string };
interface Store {
  orders: StoredOrder[];
}

const storeDirectory = (): string =>
  process.env.HUOQIU_SOCIAL_STORE_DIRECTORY ??
  resolve(process.cwd(), ".huoqiu-store");

const storePath = (): string => resolve(storeDirectory(), STORE_FILE);

const readStore = (): Store => {
  try {
    const parsed: unknown = JSON.parse(readFileSync(storePath(), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return { orders: [] };
    const orders = (parsed as Record<string, unknown>).orders;
    return { orders: Array.isArray(orders) ? (orders as StoredOrder[]) : [] };
  } catch {
    return { orders: [] };
  }
};

const writeStore = (store: Store): void => {
  mkdirSync(storeDirectory(), { recursive: true });
  writeFileSync(storePath(), `${JSON.stringify(store, null, 2)}\n`, "utf8");
};

export type RecordOrderInput = Readonly<{
  accountId: string;
  now: string;
  price: number;
  shares: number;
  side: OrderSide;
  symbol: string;
}>;

export type RecordOrderResult =
  Readonly<{ error: string }> | Readonly<{ order: Order }>;

/**
 * 某个账号当前的持仓，由委托流水推导。
 *
 * 清仓之后不留 0 股的行——那读起来像还持有。
 */
export const listPositions = (accountId: string): readonly Position[] => {
  const mine = readStore()
    .orders.filter((order) => order.accountId === accountId)
    /* 按时间正序推，否则先算到卖出会得到负的中间态。 */
    .toSorted((left, right) => left.at.localeCompare(right.at));

  const held = new Map<string, { cost: number; shares: number }>();
  for (const order of mine) {
    const current = held.get(order.symbol) ?? { cost: 0, shares: 0 };
    if (order.side === "buy") {
      held.set(order.symbol, {
        cost: current.cost + order.price * order.shares,
        shares: current.shares + order.shares,
      });
      continue;
    }
    const remaining = current.shares - order.shares;
    if (remaining <= 0) {
      held.delete(order.symbol);
      continue;
    }
    /*
     * 卖出按比例减少累计成本，剩余持仓的平均成本因此保持不变。
     * 直接从成本里减掉卖出金额是另一回事——那是把已实现盈亏混进未实现
     * 成本里，会让剩下的持仓显示出一个从没成交过的成本价。
     */
    held.set(order.symbol, {
      cost: (current.cost / current.shares) * remaining,
      shares: remaining,
    });
  }

  return [...held.entries()]
    .map(([symbol, value]) => ({
      averageCost: value.cost / value.shares,
      shares: value.shares,
      symbol,
    }))
    .toSorted((left, right) => left.symbol.localeCompare(right.symbol));
};

/** 某个账号的委托流水，最新的在前。 */
export const listOrders = (accountId: string): readonly Order[] =>
  readStore()
    .orders.filter((order) => order.accountId === accountId)
    /*
     * 去掉 accountId 再交出去：调用方要的是这个人的委托流水，
     * 每一行再挂一个「这是谁的」既冗余，也是一份不必要的外泄面。
     *
     * 显式挑字段，而不是用剩余解构把它丢掉——解构出来的那个变量没人用，
     * 而这一层的规则不接受「声明了不用」。显式列一遍还有个好处：以后往
     * StoredOrder 上加内部字段，不会顺着剩余解构漏出去。
     */
    .map((stored): Order => ({
      at: stored.at,
      id: stored.id,
      price: stored.price,
      shares: stored.shares,
      side: stored.side,
      symbol: stored.symbol,
    }))
    .toSorted((left, right) => right.at.localeCompare(left.at));

/**
 * 记一笔模拟成交。
 *
 * 价格由调用方给：它必须是服务端刚从行情接口取到的当前价。
 */
export const recordOrder = (input: RecordOrderInput): RecordOrderResult => {
  const { accountId, now, price, shares, side, symbol } = input;

  if (!/^(?:sh|sz)\d{6}$/u.test(symbol)) {
    return { error: "标的代码不正确。" };
  }
  /*
   * 按手成交。允许 37 股这种数量，持仓从第一笔起就不成立，而界面上
   * 看不出哪里不对。
   */
  if (
    !Number.isInteger(shares) ||
    shares < LOT_SIZE ||
    shares % LOT_SIZE !== 0
  ) {
    return { error: `数量必须是 ${String(LOT_SIZE)} 股的整数倍。` };
  }
  /*
   * 价格取不到时不能记成 0：成本价为 0 会算出无限收益率，
   * 而那一行看起来只是「赚得特别多」。
   */
  if (!Number.isFinite(price) || price <= 0) {
    return { error: "当前价取不到，这一笔没有记录。" };
  }

  if (side === "sell") {
    const held =
      listPositions(accountId).find((position) => position.symbol === symbol)
        ?.shares ?? 0;
    // 模拟盘里没有融券。允许卖空会算出一个负持仓。
    if (shares > held) {
      return { error: `持仓只有 ${String(held)} 股，卖不了这么多。` };
    }
  }

  const store = readStore();
  const order: Order = {
    at: now,
    id: `order_${String(store.orders.length + 1)}_${now}`,
    price,
    shares,
    side,
    symbol,
  };
  store.orders.push({ ...order, accountId });
  writeStore(store);
  return { order };
};
