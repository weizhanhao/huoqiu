import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as meRoute } from "../../src/app/api/social/me/route";
import { POST as passwordRoute } from "../../src/app/api/social/password/route";
import { issueSession } from "../../src/server/session";
import {
  authenticate,
  changePassword,
  getTokenEpoch,
  registerAccount,
} from "../../src/server/social-store";

/*
 * 修改登录密码。
 *
 * 设置页截图上只有「新密码 / 确认密码」，没有旧密码。照着做会留下一个洞：
 * 任何拿到会话的人——借用的电脑、被偷的令牌——都能直接改掉密码，把真正的
 * 机主锁在外面。所以旧密码校验是这一项的核心，而不是可选的加强。
 *
 * 另一半同样重要：改完之后旧令牌必须失效。少了这一步，「改密码」只挡住了
 * 知道旧口令的人，而真正的威胁——已经拿到令牌的那个——还有七天有效期。
 */
const OLD = "Correct-Horse-9";
const NEW = "Brand-New-Pass-42";
const NOW = "2026-08-13T00:00:00.000Z";

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-password-"));
  vi.stubEnv("HUOQIU_SOCIAL_STORE_DIRECTORY", directory);
  vi.stubEnv(
    "HUOQIU_SESSION_SECRET",
    "session-secret-for-tests-0123456789abcdef",
  );
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
});

const account = () => {
  const result = registerAccount({
    displayName: "张远",
    email: "owner@example.com",
    now: NOW,
    password: OLD,
  });
  if ("error" in result) throw new Error(result.error);
  return result.account;
};

const tokenFor = (accountId: string): string =>
  issueSession(accountId, Date.now() / 1000, getTokenEpoch(accountId)) ?? "";

const post = (body: unknown, token: string): Promise<Response> =>
  passwordRoute(
    new Request("https://example.test/api", {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        "x-huoqiu-session": token,
      },
      method: "POST",
    }),
  );

describe("changing the login password", () => {
  it("refuses without the current password", () => {
    const owner = account();

    // 这条就是截图照抄会留下的洞：不验旧口令，拿到会话就能改密码。
    expect(
      changePassword({
        accountId: owner.id,
        currentPassword: "not-the-password",
        newPassword: NEW,
        now: NOW,
      }),
    ).toEqual({ error: "当前密码不正确。" });

    // 旧口令必须仍然有效——失败的修改不该留下任何痕迹。
    expect(
      "account" in authenticate({ email: owner.email, password: OLD }),
    ).toBe(true);
  });

  it("swaps the password when the current one checks out", () => {
    const owner = account();

    expect(
      changePassword({
        accountId: owner.id,
        currentPassword: OLD,
        newPassword: NEW,
        now: NOW,
      }),
    ).toEqual({ tokenEpoch: 1 });

    expect("error" in authenticate({ email: owner.email, password: OLD })).toBe(
      true,
    );
    expect(
      "account" in authenticate({ email: owner.email, password: NEW }),
    ).toBe(true);
  });

  it("rerolls the salt instead of reusing the old one", () => {
    const owner = account();
    const before = JSON.parse(
      readFileSync(resolve(directory, "social-v1.json"), "utf8"),
    ) as { accounts: { salt: string }[] };

    changePassword({
      accountId: owner.id,
      currentPassword: OLD,
      newPassword: NEW,
      now: NOW,
    });
    const after = JSON.parse(
      readFileSync(resolve(directory, "social-v1.json"), "utf8"),
    ) as { accounts: { passwordHash: string; salt: string }[] };

    // 复用旧盐会让两次泄露之间存在可比性，也让旧彩虹表继续有效。
    expect(after.accounts[0]?.salt).not.toBe(before.accounts[0]?.salt);
    expect(JSON.stringify(after)).not.toContain(NEW);
  });

  it("refuses a new password shorter than the registration rule", () => {
    const owner = account();

    expect(
      changePassword({
        accountId: owner.id,
        currentPassword: OLD,
        newPassword: "short",
        now: NOW,
      }),
    ).toEqual({ error: "新密码至少 12 位。" });
  });

  it("refuses a new password identical to the current one", () => {
    const owner = account();

    expect(
      changePassword({
        accountId: owner.id,
        currentPassword: OLD,
        newPassword: OLD,
        now: NOW,
      }),
    ).toEqual({ error: "新密码不能与当前密码相同。" });
  });

  it("kills every token issued before the change", async () => {
    const owner = account();
    const stolen = tokenFor(owner.id);

    changePassword({
      accountId: owner.id,
      currentPassword: OLD,
      newPassword: NEW,
      now: NOW,
    });

    /*
     * 这是「改密码」真正要挡住的人：他手上的票签名仍然合法、也没过期，
     * 靠的就是世代号对不上才被拒。少了这一步，受害者改完密码以为安全了，
     * 攻击者那张票还有七天有效期。
     */
    const response = await meRoute(
      new Request("https://example.test/api", {
        headers: { "x-huoqiu-session": stolen },
      }),
    );
    const data = (await response.json()) as { account: unknown };
    expect(data.account).toBeNull();
  });

  it("hands the owner a working token back", async () => {
    const owner = account();

    const response = await post(
      { confirm_password: NEW, current_password: OLD, new_password: NEW },
      tokenFor(owner.id),
    );
    const data = (await response.json()) as { token?: string };

    expect(response.status).toBe(200);

    // 不回签的话，用户改完密码会被自己刚才那张作废的票踢下线。
    const after = await meRoute(
      new Request("https://example.test/api", {
        headers: { "x-huoqiu-session": data.token ?? "" },
      }),
    );
    const session = (await after.json()) as { account: { id: string } | null };
    expect(session.account?.id).toBe(owner.id);
  });

  it("refuses when the two new password fields disagree", async () => {
    const owner = account();

    const response = await post(
      {
        confirm_password: "Something-Else-99",
        current_password: OLD,
        new_password: NEW,
      },
      tokenFor(owner.id),
    );

    /*
     * 一致性在服务端也要查一遍：只靠界面校验的话，任何直接打接口的调用
     * 都能把密码改成用户没预期的值。
     */
    expect(response.status).toBe(400);
    expect(
      "account" in authenticate({ email: owner.email, password: OLD }),
    ).toBe(true);
  });

  it("refuses an unauthenticated change outright", async () => {
    const owner = account();

    const response = await passwordRoute(
      new Request("https://example.test/api", {
        body: JSON.stringify({
          account: owner.id,
          confirm_password: NEW,
          current_password: OLD,
          new_password: NEW,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(getTokenEpoch(owner.id)).toBe(0);
  });
});
