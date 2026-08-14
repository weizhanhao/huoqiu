import { createHmac, timingSafeEqual } from "node:crypto";

import { getTokenEpoch } from "./social-store";

/*
 * 会话令牌。
 *
 * 在此之前，接口把请求体里的 account 字段直接当成身份用：
 *
 *   POST /api/social/posts   { account: "<别人的 acct_ id>", body: "…" }
 *   GET  /api/social/messages?account=<别人的 acct_ id>
 *
 * 没有任何凭证校验。而这个 id 是公开的——它就印在个人主页地址里
 * （/users/acct_…）。也就是说，知道任何人的主页链接，就能以其名义发帖、
 * 关注，甚至读走他的全部私信（读完还会被标记为已读）。
 *
 * 登录本身是做了的：口令用 scrypt 校验。缺的是登录之后那一步——把「已经
 * 证明过身份」变成一张不可伪造的凭证。这里补的就是这一步。
 *
 * 令牌 = base64url(accountId:过期秒) + "." + base64url(HMAC-SHA256)。
 * 服务端不存会话状态：签名本身就是凭证，改一个字节就验不过。
 */

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MINIMUM_SECRET_BYTES = 32;

/*
 * 密钥缺失时拒绝工作，而不是退回一个默认值。
 *
 * 内置默认密钥意味着任何人都能照着仓库里的常量签出合法令牌——那比没有
 * 会话更糟，因为界面上看起来是有防护的。
 */
const secret = (): Buffer | null => {
  const value = process.env.HUOQIU_SESSION_SECRET;
  if (value === undefined) return null;
  const bytes = Buffer.from(value, "utf8");
  return bytes.byteLength < MINIMUM_SECRET_BYTES ? null : bytes;
};

const sign = (payload: string, key: Buffer): string =>
  createHmac("sha256", key).update(payload).digest("base64url");

const ACCOUNT_PATTERN = /^acct_[0-9a-f]{16}$/u;

export const sessionsAvailable = (): boolean => secret() !== null;

/**
 * 签发令牌；密钥未配置时返回 null，由调用方决定如何回应。
 *
 * epoch 是账号的令牌世代号，改密码时会 +1，用来让此前签发的票据整体作废。
 */
export const issueSession = (
  accountId: string,
  nowSeconds: number,
  epoch = 0,
): string | null => {
  const key = secret();
  if (key === null || !ACCOUNT_PATTERN.test(accountId)) {
    return null;
  }
  const expiresAt = Math.floor(nowSeconds) + SESSION_TTL_SECONDS;
  const payload = `${accountId}:${Math.floor(epoch)}:${expiresAt}`;
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, key)}`;
};

/**
 * 校验令牌并取出账号 id。
 *
 * 任何一步不通过都返回 null，不区分「签名错」「过期」「格式坏」——
 * 把失败原因告诉调用者，等于帮着试探令牌的构造方式。
 */
export type SessionClaims = Readonly<{ accountId: string; epoch: number }>;

export const verifySession = (
  token: string | null | undefined,
  nowSeconds: number,
): SessionClaims | null => {
  const key = secret();
  if (key === null || typeof token !== "string") return null;

  const separator = token.indexOf(".");
  if (separator <= 0) return null;
  const encoded = token.slice(0, separator);
  const provided = token.slice(separator + 1);

  const expected = sign(encoded, key);
  const providedBytes = Buffer.from(provided, "base64url");
  const expectedBytes = Buffer.from(expected, "base64url");
  if (
    providedBytes.byteLength !== expectedBytes.byteLength ||
    !timingSafeEqual(providedBytes, expectedBytes)
  ) {
    return null;
  }

  const payload = Buffer.from(encoded, "base64url").toString("utf8");
  // 账号 id 里不含冒号，所以整段恰好切成三份；多一份少一份都判为坏票。
  const parts = payload.split(":");
  if (parts.length !== 3) return null;
  const [accountId = "", rawEpoch = "", rawExpiry = ""] = parts;
  const epoch = Number(rawEpoch);
  const expiresAt = Number(rawExpiry);

  if (!ACCOUNT_PATTERN.test(accountId)) return null;
  if (!Number.isSafeInteger(epoch) || epoch < 0) return null;
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= nowSeconds) return null;
  return { accountId, epoch };
};

/*
 * 令牌走专用头，Authorization 只作兼容。
 *
 * 预览网关自己用 Authorization: Basic 做接入鉴权，并且只透传一份白名单里的
 * 请求头——authorization 不在其中。也就是说浏览器发出的 Bearer 令牌根本
 * 到不了应用，整套会话在预览环境下会静默失效。
 *
 * 换一个不与代理争用的头就没有这个问题。Authorization: Bearer 仍然接受，
 * 供直连场景（测试、curl、不走这层网关的部署）使用。
 */
const SESSION_HEADER = "x-huoqiu-session";

export const readBearerToken = (request: Request): string | null => {
  const direct = request.headers.get(SESSION_HEADER);
  if (direct !== null && direct.trim().length > 0) {
    return direct.trim();
  }
  const header = request.headers.get("authorization");
  if (header === null) return null;
  const match = /^Bearer (.+)$/u.exec(header.trim());
  return match?.[1] ?? null;
};

/**
 * 请求所属账号；无有效令牌时为 null。接口一律以此为准，不看请求体。
 *
 * 除了验签和有效期，这里还比对账号当前的令牌世代号：改过密码之后，
 * 此前签发的票据世代号偏小，一律拒绝。签名本身仍然合法——所以这一步
 * 不能省，否则「改密码」挡不住已经拿到令牌的人。
 */
export const currentAccountId = (request: Request): string | null => {
  const claims = verifySession(
    readBearerToken(request),
    Math.floor(Date.now() / 1000),
  );
  if (claims === null) return null;
  return claims.epoch === getTokenEpoch(claims.accountId)
    ? claims.accountId
    : null;
};
