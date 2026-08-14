import { NextResponse } from "next/server";

import { listPublicPortfolios } from "../../../../../server/portfolio-store";

/*
 * 组合榜。
 *
 * 不需要登录：榜单本来就是给所有人看的，未登录时也该看得到别人建了什么。
 * 返回的都是公开信息——组合名、持仓、建它的人的昵称。
 *
 * 收益不在这里算。持仓的当日涨跌幅由前端向行情接口一次问齐；
 * 在这里逐个组合去取，会把一次页面加载变成几十次上游请求。
 */
export const dynamic = "force-dynamic";

/*
 * 一页最多这么多条。
 * 不设上限的话，组合攒到几千条时这个接口会把整份库序列化成一个响应。
 */
const MAX_ROWS = 50;

export function GET(): NextResponse {
  return NextResponse.json({
    portfolios: listPublicPortfolios().slice(0, MAX_ROWS),
  });
}
