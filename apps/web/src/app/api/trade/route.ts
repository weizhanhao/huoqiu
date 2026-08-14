import { NextResponse } from "next/server";

import { loadListQuotes } from "../../../server/market-list.server";
import {
  LOT_SIZE,
  listOrders,
  listPositions,
  recordOrder,
} from "../../../server/paper-trading";
import { currentAccountId } from "../../../server/session";
import { throttleUpstream } from "../../../server/upstream-throttle";

/*
 * 模拟交易。
 *
 * 要令牌：账本是「我的」持仓与委托，不是公开数据。请求体里不接受 account
 * 字段——否则谁都能往别人的账本里记一笔。
 *
 * 最要紧的一条：**成交价由服务端取，绝不接受请求体里的价格**。
 * 客户端说了算的话，「1 块钱买茅台」就成立了，而账本上看不出任何异常。
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const accountId = currentAccountId(request);
  if (accountId === null) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const positions = listPositions(accountId);
  /*
   * 现价随持仓一起给：盈亏必须按此刻的真实价格算，让客户端拿成本价自己
   * 编一个涨跌幅是另一回事。
   */
  const quotes =
    positions.length === 0
      ? null
      : await loadListQuotes(positions.map((position) => position.symbol));

  return NextResponse.json({
    orders: listOrders(accountId),
    positions: positions.map((position) => {
      const quote = quotes?.find((row) => row.symbol === position.symbol);
      return {
        ...position,
        last: quote?.last ?? null,
        name: quote?.name ?? null,
      };
    }),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const accountId = currentAccountId(request);
  if (accountId === null) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  // 下单要去行情接口取现价，也是一次外呼，先过闸。
  const throttled = throttleUpstream(request, "trade");
  if (throttled !== null) return throttled;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "请求体不是合法 JSON。" },
      { status: 400 },
    );
  }

  const body = payload as Record<string, unknown>;
  /*
   * 先归一化再校验。
   *
   * 行情那一层内部会自己 trim + 转小写，而账本那一层的正则是大小写敏感的
   * ——`SH600519` 于是会「行情取得到、下单被拒」，白白打了一次上游，
   * 报出来的还是「标的代码不正确」，看不出问题出在大小写上。
   */
  const symbol =
    typeof body.symbol === "string" ? body.symbol.trim().toLowerCase() : "";
  const side = body.side === "sell" ? "sell" : "buy";
  const shares = typeof body.shares === "number" ? body.shares : Number.NaN;

  /*
   * 格式与手数在取行情之前就能判掉。放在后面的话，一个明显非法的请求
   * 也会先触发一次真实外呼，白占节流配额。
   */
  if (!/^(?:sh|sz)\d{6}$/u.test(symbol)) {
    return NextResponse.json({ error: "标的代码不正确。" }, { status: 400 });
  }
  if (
    !Number.isInteger(shares) ||
    shares < LOT_SIZE ||
    shares % LOT_SIZE !== 0
  ) {
    return NextResponse.json(
      { error: `数量必须是 ${String(LOT_SIZE)} 股的整数倍。` },
      { status: 400 },
    );
  }

  /*
   * 这里刻意不读 body.price。
   * 成交价只能是服务端刚取到的真实现价——把它交给客户端，等于把账本
   * 的可信度整个交出去。
   */
  const quotes = await loadListQuotes([symbol]);
  const last = quotes?.[0]?.last ?? null;
  if (last === null) {
    return NextResponse.json(
      { error: "当前价取不到，这一笔没有记录。" },
      { status: 503 },
    );
  }

  const result = recordOrder({
    accountId,
    now: new Date().toISOString(),
    price: last,
    shares,
    side,
    symbol,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ order: result.order }, { status: 201 });
}
