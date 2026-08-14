import { NextResponse } from "next/server";

import { consumeAttempt } from "./rate-limit";

/*
 * 外呼节流。
 *
 * 行情、基金、私募、视频这些接口每被调用一次，服务端就会向站外发一次请求。
 * 它们按设计不鉴权——公开数据，加一道登录挡不住任何人，只会让未登录用户
 * 的页面变空白。但「不鉴权」也意味着没有任何门槛：谁都可以拿本站当一个
 * 匿名代理，对着上游一直打。
 *
 * 后果不是假设的。做行情的时候就撞见过：push2 被打多了之后不返回错误码，
 * 而是回一个 HTTP 200 加空 body——站上表现为「行情取不到」，而且是整站
 * 所有人都取不到。把自己的出站量管住，首先是在保自己。
 *
 * 计数只在内存里，和 rate-limit.ts 同一套滑动窗口。进程重启即清空，
 * 多实例之间也不共享——对当前这个单进程部署够用，别当成分布式限流。
 */

/** 每个来源、每个接口，一分钟内允许的次数。 */
export const UPSTREAM_LIMIT = 60;
export const UPSTREAM_WINDOW_MS = 60_000;

/*
 * 拿不到来源时归进这个键。
 *
 * 不是放行：本站的预览网关就不加 x-forwarded-for。那种情况下所有请求
 * 算作一个共享的总闸，仍然限得住，只是限得粗。
 */
const SHARED_KEY = "upstream:no-forwarded-for";

/**
 * 这次请求算在谁头上。
 *
 * x-forwarded-for 的格式是「客户端, 代理1, 代理2」，取第一个。取最后一个
 * 等于把所有人都算到同一个代理头上——一个人打满，所有人一起被限。
 */
export const clientKeyOf = (request: Request): string => {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim() ?? "";
  return first.length === 0 ? SHARED_KEY : first;
};

/**
 * 放行返回 null；超限返回一个可以直接 return 的 429。
 *
 * `endpoint` 用来把不同接口的计数分开：一个页面会同时打好几个接口
 * （行情页就有概览 + 异动），共用一个计数的话，正常浏览几下就会把自己限住。
 */
export const throttleUpstream = (
  request: Request,
  endpoint = "upstream",
): NextResponse | null => {
  const decision = consumeAttempt(
    `upstream:${endpoint}:${clientKeyOf(request)}`,
    {
      limit: UPSTREAM_LIMIT,
      now: Date.now(),
      windowMs: UPSTREAM_WINDOW_MS,
    },
  );

  if (decision.allowed) return null;

  return NextResponse.json(
    // 不提上游是谁：那等于告诉对方该去打哪个站。
    { error: "请求过于频繁，请稍后再试。" },
    {
      headers: { "retry-after": String(decision.retryAfterSeconds) },
      status: 429,
    },
  );
};
