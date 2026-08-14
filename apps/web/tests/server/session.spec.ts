import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  issueSession,
  readBearerToken,
  sessionsAvailable,
  verifySession,
} from "../../src/server/session";

/*
 * 会话令牌。
 *
 * 这块之前整个不存在：接口把请求体里的 account 当身份用，而那个 id 就印在
 * 个人主页地址里。知道别人主页链接就能以其名义发帖、关注、读走全部私信。
 *
 * 令牌是唯一挡在中间的东西，所以这里按「攻击者会怎么试」来写：伪造签名、
 * 改账号、换密钥、用过期票。任何一条漏过去，整套防护都等于没有。
 */
const SECRET = "session-secret-for-tests-0123456789abcdef";
const ACCOUNT = "acct_0a1b2c3d4e5f6a7b";
const NOW = 1_786_000_000;

beforeEach(() => {
  vi.stubEnv("HUOQIU_SESSION_SECRET", SECRET);
});

describe("session tokens", () => {
  it("round-trips the account that was signed", () => {
    const token = issueSession(ACCOUNT, NOW);

    expect(token).not.toBeNull();
    /*
     * 令牌现在还带一个世代号：改密码时账号侧 +1，旧票据据此整体作废。
     * 所以校验返回的是 {accountId, epoch} 而不再是单个 id。
     */
    expect(verifySession(token, NOW)).toEqual({
      accountId: ACCOUNT,
      epoch: 0,
    });
  });

  it("carries the epoch it was issued with", () => {
    const token = issueSession(ACCOUNT, NOW, 3);

    expect(verifySession(token, NOW)).toEqual({ accountId: ACCOUNT, epoch: 3 });
  });

  it("refuses a token whose account was swapped", () => {
    const token = issueSession(ACCOUNT, NOW) ?? "";
    const [encoded = "", signature = ""] = token.split(".");
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    const forgedPayload = payload.replace(ACCOUNT, "acct_ffffffffffffffff");
    const forged = `${Buffer.from(forgedPayload, "utf8").toString("base64url")}.${signature}`;

    /*
     * 这正是漏洞的原始形态：换一个别人的账号 id 就冒充成功。
     * 载荷一改签名就对不上，令牌必须整体作废。
     */
    expect(verifySession(forged, NOW)).toBeNull();
  });

  it("refuses a token signed with another secret", () => {
    vi.stubEnv("HUOQIU_SESSION_SECRET", "a-different-secret-0123456789abcdef");
    const foreign = issueSession(ACCOUNT, NOW);

    vi.stubEnv("HUOQIU_SESSION_SECRET", SECRET);
    expect(verifySession(foreign, NOW)).toBeNull();
  });

  it("refuses an expired token", () => {
    const token = issueSession(ACCOUNT, NOW);

    // 有效期内可用，过期后不可用；不设过期等于令牌泄漏一次就永久有效。
    expect(verifySession(token, NOW + 6 * 24 * 60 * 60)).toEqual({
      accountId: ACCOUNT,
      epoch: 0,
    });
    expect(verifySession(token, NOW + 8 * 24 * 60 * 60)).toBeNull();
  });

  it("refuses malformed and empty tokens", () => {
    for (const candidate of ["", ".", "abc", "abc.def", null, undefined]) {
      expect(verifySession(candidate, NOW)).toBeNull();
    }
  });

  it("issues nothing when no secret is configured", () => {
    vi.stubEnv("HUOQIU_SESSION_SECRET", undefined);

    /*
     * 未配置密钥时必须整体停摆，不能退回内置默认值——那样任何人都能照着
     * 仓库里的常量签出合法令牌，而界面上看起来是有防护的。
     */
    expect(sessionsAvailable()).toBe(false);
    expect(issueSession(ACCOUNT, NOW)).toBeNull();
  });

  it("refuses a secret that is too short to be worth signing with", () => {
    vi.stubEnv("HUOQIU_SESSION_SECRET", "short");

    expect(sessionsAvailable()).toBe(false);
    expect(issueSession(ACCOUNT, NOW)).toBeNull();
  });

  it("reads the token only from an Authorization bearer header", () => {
    const withHeader = new Request("https://example.test/", {
      headers: { authorization: "Bearer abc.def" },
    });
    const withoutHeader = new Request("https://example.test/");

    expect(readBearerToken(withHeader)).toBe("abc.def");
    expect(readBearerToken(withoutHeader)).toBeNull();
  });
});
