import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authenticate,
  changeEmail,
  getOwnAccount,
  registerAccount,
} from "../../src/server/social-store";

/*
 * 修改登录邮箱。
 *
 * 账号绑定那一页上，手机号与微信都接不了（没有短信通道、没有开放平台资质），
 * 唯一能做真的就是这一项。
 *
 * 两条底线：
 *   一、必须验当前口令。改登录邮箱等于改登录入口——只凭一个已登录的会话
 *       就能改掉它，那么任何一次会话泄露都会直接变成账号被夺走。
 *   二、新邮箱不能已被别人占用。两个账号同一个邮箱，登录时会认错人。
 */

const PASSWORD = "Correct-Horse-9";

let directory = "";

const makeAccount = (email: string, displayName: string) => {
  const result = registerAccount({
    displayName,
    email,
    now: "2026-08-13T00:00:00.000Z",
    password: PASSWORD,
  });
  if ("error" in result) throw new Error(result.error);
  return result.account;
};

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-email-"));
  vi.stubEnv("HUOQIU_SOCIAL_STORE_DIRECTORY", directory);
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
});

describe("changing the login email", () => {
  it("moves the login to the new address", () => {
    const account = makeAccount("before@example.com", "张远");

    const result = changeEmail({
      accountId: account.id,
      currentPassword: PASSWORD,
      newEmail: "after@example.com",
    });

    expect("error" in result).toBe(false);
    expect(getOwnAccount(account.id)?.email).toBe("after@example.com");
    // 新地址能登录，旧地址不能——否则等于多开了一个入口。
    expect(
      "account" in
        authenticate({ email: "after@example.com", password: PASSWORD }),
    ).toBe(true);
    expect(
      "account" in
        authenticate({ email: "before@example.com", password: PASSWORD }),
    ).toBe(false);
  });

  it("insists on the current password", () => {
    const account = makeAccount("guarded@example.com", "张远");

    /*
     * 改登录邮箱等于改登录入口。只凭一个已登录的会话就能改掉它，
     * 那么任何一次会话泄露都会直接变成账号被夺走——受害者连登录都做不到了。
     */
    const result = changeEmail({
      accountId: account.id,
      currentPassword: "wrong-password",
      newEmail: "attacker@example.com",
    });

    expect("error" in result).toBe(true);
    expect(getOwnAccount(account.id)?.email).toBe("guarded@example.com");
  });

  it("refuses an address another account already uses", () => {
    const first = makeAccount("taken@example.com", "张远");
    const second = makeAccount("mine@example.com", "李行");

    // 两个账号同一个邮箱，登录时会认错人。
    const result = changeEmail({
      accountId: second.id,
      currentPassword: PASSWORD,
      newEmail: "taken@example.com",
    });

    expect("error" in result).toBe(true);
    expect(getOwnAccount(second.id)?.email).toBe("mine@example.com");
    expect(getOwnAccount(first.id)?.email).toBe("taken@example.com");
  });

  it("lets an account keep its own address", () => {
    const account = makeAccount("same@example.com", "张远");

    /*
     * 改成自己现在这个地址不算冲突——否则「没改动就提交」会报一句
     * 莫名其妙的「该邮箱已被占用」。
     */
    const result = changeEmail({
      accountId: account.id,
      currentPassword: PASSWORD,
      newEmail: "SAME@example.com",
    });

    expect("error" in result).toBe(false);
    expect(getOwnAccount(account.id)?.email).toBe("same@example.com");
  });

  it("refuses something that is not an address", () => {
    const account = makeAccount("shape@example.com", "张远");

    for (const newEmail of ["", "not-an-email", "a@", "@b.com", "a b@c.com"]) {
      const result = changeEmail({
        accountId: account.id,
        currentPassword: PASSWORD,
        newEmail,
      });
      expect("error" in result, newEmail).toBe(true);
    }
    expect(getOwnAccount(account.id)?.email).toBe("shape@example.com");
  });

  it("refuses an account that does not exist", () => {
    const result = changeEmail({
      accountId: "acct_0000000000000000",
      currentPassword: PASSWORD,
      newEmail: "ghost@example.com",
    });

    expect("error" in result).toBe(true);
  });
});
