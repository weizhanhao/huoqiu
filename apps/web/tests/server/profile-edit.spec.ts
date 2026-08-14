import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as profileRoute } from "../../src/app/api/social/profile/route";
import { loadProfile } from "../../src/features/account/profile-lookup.server";
import { issueSession } from "../../src/server/session";
import {
  getAccount,
  registerAccount,
  updateProfile,
} from "../../src/server/social-store";

/*
 * 编辑资料。
 *
 * 这一项最容易做成「存了但看不见」：设置页明写「简介将公开显示在你的个人
 * 主页上」，而主页此前显示的是一句写死的固定文案。改完资料主页还是老样子，
 * 就等于没做——所以这里不只测存进去了，还测主页读出来的是本人写的那句。
 */
const NOW = "2026-08-13T00:00:00.000Z";

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-profile-"));
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
    displayName: "周牧",
    email: "owner@example.com",
    now: NOW,
    password: "Correct-Horse-9",
  });
  if ("error" in result) throw new Error(result.error);
  return result.account;
};

describe("editing your profile", () => {
  it("starts with empty fields rather than invented ones", () => {
    const owner = account();
    const stored = getAccount(owner.id);

    // 没填过就是空的，不替用户编一个居住地或简介出来。
    expect(stored?.bio).toBe("");
    expect(stored?.province).toBe("");
    expect(stored?.gender).toBe("secret");
  });

  it("saves every field and shows the bio on the public profile", () => {
    const owner = account();

    updateProfile({
      accountId: owner.id,
      bio: "记录事实，再写判断。",
      city: "杭州",
      displayName: "周牧之",
      gender: "secret",
      province: "浙江",
    });

    const stored = getAccount(owner.id);
    expect(stored?.displayName).toBe("周牧之");
    expect(stored?.province).toBe("浙江");
    expect(stored?.city).toBe("杭州");

    /*
     * 关键的一条：主页显示的必须是本人写的简介。
     * 存进去却仍显示那句固定文案，就是这一项最典型的假完成。
     */
    expect(loadProfile(owner.id)?.bio).toBe("记录事实，再写判断。");
    expect(loadProfile(owner.id)?.displayName).toBe("周牧之");
  });

  it("falls back to the stock line only while the bio is empty", () => {
    const owner = account();

    // 没填简介时给一句说明是合理的，但那不该是所有人的简介。
    expect(loadProfile(owner.id)?.bio).toContain("在本机注册的账号");
  });

  it("leaves untouched fields alone", () => {
    const owner = account();
    updateProfile({
      accountId: owner.id,
      bio: "先记录事实。",
      province: "浙江",
    });

    // 设置页分三个页签，一次只提交一部分；整条覆盖会把别的字段抹掉。
    updateProfile({ accountId: owner.id, displayName: "周牧之" });

    const stored = getAccount(owner.id);
    expect(stored?.bio).toBe("先记录事实。");
    expect(stored?.province).toBe("浙江");
    expect(stored?.displayName).toBe("周牧之");
  });

  it("refuses an empty nickname", () => {
    const owner = account();

    expect(updateProfile({ accountId: owner.id, displayName: "   " })).toEqual({
      error: "昵称需要 1–80 个字符。",
    });
    expect(getAccount(owner.id)?.displayName).toBe("周牧");
  });

  it("refuses a bio longer than the stated limit", () => {
    const owner = account();

    // 设置页写着「全长不超过200字」，那就得真的挡住。
    expect(
      updateProfile({ accountId: owner.id, bio: "字".repeat(201) }),
    ).toEqual({ error: "个人简介不超过 200 字。" });
  });

  it("refuses a gender outside the three options", () => {
    const owner = account();

    expect(updateProfile({ accountId: owner.id, gender: "other" })).toEqual({
      error: "无效的性别设置。",
    });
  });

  it("refuses to edit somebody else's profile", async () => {
    const owner = account();
    const intruder = registerAccount({
      displayName: "林曦",
      email: "other@example.com",
      now: NOW,
      password: "Correct-Horse-9",
    });
    if ("error" in intruder) throw new Error(intruder.error);
    const token = issueSession(intruder.account.id, Date.now() / 1000, 0) ?? "";

    const response = await profileRoute(
      new Request("https://example.test/api", {
        body: JSON.stringify({
          account: owner.id,
          display_name: "被改掉的名字",
        }),
        headers: {
          "content-type": "application/json",
          "x-huoqiu-session": token,
        },
        method: "POST",
      }),
    );
    const data = (await response.json()) as { account: { id: string } };

    /*
     * 请求体里写别人的 id 不该有任何效果：改动只会落在持票人自己头上。
     * 昵称能被别人改掉，等于站上任何人都能冒名。
     */
    expect(data.account.id).toBe(intruder.account.id);
    expect(getAccount(owner.id)?.displayName).toBe("周牧");
  });

  it("refuses an unauthenticated edit outright", async () => {
    const owner = account();

    const response = await profileRoute(
      new Request("https://example.test/api", {
        body: JSON.stringify({ account: owner.id, display_name: "冒名" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
    expect(getAccount(owner.id)?.displayName).toBe("周牧");
  });
});
