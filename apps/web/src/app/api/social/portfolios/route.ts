import { NextResponse } from "next/server";

import {
  createPortfolio,
  listFollowedPortfolios,
  listPortfoliosByOwner,
  setPortfolioFollow,
  type Holding,
} from "../../../../server/portfolio-store";
import { consumeAttempt } from "../../../../server/rate-limit";
import { currentAccountId } from "../../../../server/session";

/*
 * 组合：我创建的、我关注的。
 *
 * 身份只认令牌。请求体里的 account 一概不看——那个 id 是公开的，
 * 就印在个人主页地址上，信它等于允许任何人以别人的名义建组合。
 */
export const dynamic = "force-dynamic";

/*
 * 建组合是写操作，每次都是「读全量 → 追加 → 全量重写」。不限次数的话，
 * 一个已登录用户可以循环建合法组合，把文件和每次请求的耗时一起撑大，
 * 而且没有删除接口能回收。
 */
const WRITE_LIMIT = 30;
const WRITE_WINDOW_MS = 5 * 60 * 1000;

/** 与取数层的 MAX_HOLDINGS 对齐，在物化数组之前就挡住。 */
const MAX_HOLDINGS = 50;

export function GET(request: Request): NextResponse {
  const accountId = currentAccountId(request);
  if (accountId === null) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  return NextResponse.json({
    created: listPortfoliosByOwner(accountId),
    followed: listFollowedPortfolios(accountId),
  });
}

/** 请求体里的持仓：{symbol, weight} 的数组，权重是百分数。 */
const readHoldings = (value: unknown): readonly Holding[] | null => {
  if (!Array.isArray(value)) return null;
  /*
   * 先看长度再遍历。放到后面才拒的话，一个百万元素的数组会先被完整
   * 遍历并物化成对象数组，内存已经吃掉了才发现超限。
   */
  if (value.length > MAX_HOLDINGS) return null;
  const holdings: Holding[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const row = entry as Record<string, unknown>;
    if (typeof row.symbol !== "string" || typeof row.weight !== "number") {
      return null;
    }
    holdings.push({ symbol: row.symbol, weight: row.weight });
  }
  return holdings;
};

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "请求体不是合法 JSON。" },
      { status: 400 },
    );
  }

  const accountId = currentAccountId(request);
  if (accountId === null) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const decision = consumeAttempt(`portfolio:${accountId}`, {
    limit: WRITE_LIMIT,
    now: Date.now(),
    windowMs: WRITE_WINDOW_MS,
  });
  if (!decision.allowed) {
    return NextResponse.json(
      { error: "操作过于频繁，请稍后再试。" },
      {
        headers: { "retry-after": String(decision.retryAfterSeconds) },
        status: 429,
      },
    );
  }

  const body = payload as Record<string, unknown>;

  /*
   * 关注/取关走同一个入口：请求体带 portfolio + followed 就是关注操作。
   * 关注一个不存在的组合不会留下记录，取数层已经挡住了。
   */
  if (
    typeof body.portfolio === "string" &&
    typeof body.followed === "boolean"
  ) {
    setPortfolioFollow(accountId, body.portfolio, body.followed);
    return NextResponse.json({
      created: listPortfoliosByOwner(accountId),
      followed: listFollowedPortfolios(accountId),
    });
  }

  const holdings = readHoldings(body.holdings);
  if (holdings === null) {
    return NextResponse.json(
      { error: "持仓格式不对：需要 {symbol, weight} 的数组。" },
      { status: 400 },
    );
  }

  const result = createPortfolio({
    holdings,
    name: typeof body.name === "string" ? body.name : "",
    now: new Date().toISOString(),
    ownerId: accountId,
    summary: typeof body.summary === "string" ? body.summary : "",
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ portfolio: result.portfolio }, { status: 201 });
}
