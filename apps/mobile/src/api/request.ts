import { apiUrl } from "./config";

/*
 * 所有接口调用都走这里。
 *
 * 社交和行情各写一份的话，两份的错误分流迟早会长歪——一处把断网算成
 * 「没有数据」，另一处算成「服务端故障」，同一个网络问题在两个页签上
 * 显示成两回事。
 */

/*
 * 取数结果分三种，不是两种。
 *
 * 「连不上」和「服务端说不行」必须分开：前者是网络问题（手机不在内网时会
 * 一直是它），后者是业务拒绝（密码太短、没登录）。混成一句「加载失败」，
 * 用户会朝错误的方向排查——反复改密码，而其实是没连上那个网。
 */
export type ApiResult<T> =
  | Readonly<{ kind: "ok"; value: T }>
  | Readonly<{ kind: "offline"; message: string }>
  | Readonly<{ kind: "rejected"; message: string }>;

export const OFFLINE_MESSAGE = "连不上服务器。确认手机和服务在同一个网络里。";

const SESSION_HEADER = "x-huoqiu-session";

const authHeaders = (token: string | null): Record<string, string> =>
  token === null ? {} : { [SESSION_HEADER]: token };

type JsonBody = Readonly<Record<string, unknown>>;

/* 服务端把失败原因放在 error 字段里（见 social/login、market/quotes）。 */
const readError = (body: unknown, fallback: string): string => {
  if (typeof body === "object" && body !== null && "error" in body) {
    const { error } = body as Readonly<{ error?: unknown }>;
    if (typeof error === "string" && error.length > 0) return error;
  }
  return fallback;
};

export const request = async <T>(
  path: string,
  init: Readonly<{ body?: JsonBody; method: string; token: string | null }>,
): Promise<ApiResult<T>> => {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      headers: {
        ...authHeaders(init.token),
        ...(init.body === undefined
          ? {}
          : { "content-type": "application/json" }),
      },
      method: init.method,
    });
  } catch {
    /* fetch 只在连不上时 reject；HTTP 4xx/5xx 是正常 resolve。 */
    return { kind: "offline", message: OFFLINE_MESSAGE };
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return {
      kind: "rejected",
      message: `服务端返回了读不懂的内容（HTTP ${String(response.status)}）。`,
    };
  }

  if (!response.ok) {
    return {
      kind: "rejected",
      message: readError(
        parsed,
        `请求失败（HTTP ${String(response.status)}）。`,
      ),
    };
  }

  return { kind: "ok", value: parsed as T };
};
