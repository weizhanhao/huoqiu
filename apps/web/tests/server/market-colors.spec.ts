import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getCommentPolicy,
  getMarketColors,
  registerAccount,
  setCommentPolicy,
  setMarketColors,
} from "../../src/server/social-store";

/*
 * 涨跌配色。
 *
 * 这一项本身不复杂，难点在它和评论权限共用同一条偏好记录：整条替换的写法
 * 会让改一项把另一项抹回默认，而用户根本没碰过那个设置。
 */
const NOW = "2026-08-13T00:00:00.000Z";

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-colors-"));
  vi.stubEnv("HUOQIU_SOCIAL_STORE_DIRECTORY", directory);
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
});

const account = () => {
  const result = registerAccount({
    displayName: "张远",
    email: "owner@example.com",
    now: NOW,
    password: "Correct-Horse-9",
  });
  if ("error" in result) throw new Error(result.error);
  return result.account;
};

describe("market colour preference", () => {
  it("defaults to red-up, matching the A-share convention", () => {
    expect(getMarketColors(account().id)).toBe("red-up");
  });

  it("remembers the choice", () => {
    const owner = account();

    setMarketColors({ accountId: owner.id, mode: "green-up", now: NOW });

    expect(getMarketColors(owner.id)).toBe("green-up");
  });

  it("refuses a mode that is not one of the two", () => {
    const owner = account();

    // 存进认不出的值，界面上那个属性就会写出一个没有任何规则匹配的状态。
    expect(
      setMarketColors({ accountId: owner.id, mode: "rainbow", now: NOW }),
    ).toEqual({ error: "无效的涨跌配色设置。" });
    expect(getMarketColors(owner.id)).toBe("red-up");
  });

  it("does not reset the comment policy when the colour changes", () => {
    const owner = account();
    setCommentPolicy({ accountId: owner.id, now: NOW, policy: "off" });

    setMarketColors({ accountId: owner.id, mode: "green-up", now: NOW });

    /*
     * 两个字段共用一条偏好记录。整条替换的写法会把另一项抹回默认——
     * 用户改一下配色，评论权限就从「关闭评论」悄悄变回「所有人」，
     * 而他根本没碰过那个设置。放开的还恰好是更该守的那一项。
     */
    expect(getCommentPolicy(owner.id)).toBe("off");
    expect(getMarketColors(owner.id)).toBe("green-up");
  });

  it("does not reset the colour when the comment policy changes", () => {
    const owner = account();
    setMarketColors({ accountId: owner.id, mode: "green-up", now: NOW });

    setCommentPolicy({ accountId: owner.id, now: NOW, policy: "followers" });

    // 反方向同理。
    expect(getMarketColors(owner.id)).toBe("green-up");
    expect(getCommentPolicy(owner.id)).toBe("followers");
  });
});
