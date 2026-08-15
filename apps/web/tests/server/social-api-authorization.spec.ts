import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as followRoute } from "../../src/app/api/social/follow/route";
import { GET as meRoute } from "../../src/app/api/social/me/route";
import {
  GET as messagesGet,
  POST as messagesPost,
} from "../../src/app/api/social/messages/route";
import { POST as postsRoute } from "../../src/app/api/social/posts/route";
import { POST as emailPost } from "../../src/app/api/social/email/route";
import { POST as portfoliosPost } from "../../src/app/api/social/portfolios/route";
import { GET as profileGet } from "../../src/app/api/social/profile/route";
import { issueSession } from "../../src/server/session";
import {
  getOwnAccount,
  registerAccount,
  sendMessage,
} from "../../src/server/social-store";

/*
 * 越权。
 *
 * 这些接口原先直接把请求体（或查询串）里的 account 当身份用，而那个 id 是
 * 公开的——它就印在个人主页地址里。抄一条别人的主页链接，就能以其名义发帖、
 * 关注，还能读走他的全部私信，读完顺手替他标成已读。
 *
 * 所以这里全部按「攻击者手上有受害者的公开 id，但没有他的口令」来写。
 * 每一条都必须失败。
 */
const SECRET = "session-secret-for-tests-0123456789abcdef";

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-api-"));
  vi.stubEnv("HUOQIU_SOCIAL_STORE_DIRECTORY", directory);
  vi.stubEnv("HUOQIU_SESSION_SECRET", SECRET);
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
});

const makeAccount = (email: string, displayName: string) => {
  const result = registerAccount({
    displayName,
    email,
    now: "2026-08-13T00:00:00.000Z",
    password: "Correct-Horse-9",
  });
  if ("error" in result) throw new Error(result.error);
  return result.account;
};

const jsonRequest = (body: unknown, token?: string): Request =>
  new Request("https://example.test/api", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
    },
    method: "POST",
  });

describe("social API refuses to act as somebody else", () => {
  it("will not publish a post under a victim's public account id", async () => {
    const victim = makeAccount("victim@example.com", "张远");

    /*
     * 攻击者知道的全部信息就是这个 id——它印在 /users/<id> 上。
     * 这一条过去会成功，站上会多出一条署着受害者名字的帖子。
     */
    const response = await postsRoute(
      jsonRequest({ account: victim.id, body: "不是我写的。", title: "冒名" }),
    );

    expect(response.status).toBe(401);
  });

  it("attributes a post to the token holder, ignoring the body's account field", async () => {
    const author = makeAccount("author@example.com", "林曦");
    const victim = makeAccount("victim@example.com", "张远");
    const token = issueSession(author.id, Date.now() / 1000) ?? "";

    // 持票人是林曦，请求体却声称是张远：必须按令牌算，请求体那个字段不该被看。
    const response = await postsRoute(
      jsonRequest(
        { account: victim.id, body: "先记录事实。", title: "我的记录" },
        token,
      ),
    );
    const data = (await response.json()) as { post: { authorId: string } };

    expect(response.status).toBe(201);
    expect(data.post.authorId).toBe(author.id);
  });

  it("will not read a victim's private messages", async () => {
    const victim = makeAccount("victim@example.com", "张远");
    const friend = makeAccount("friend@example.com", "林曦");
    sendMessage({
      body: "只给张远看的内容。",
      fromId: friend.id,
      now: "2026-08-13T00:00:00.000Z",
      toId: victim.id,
    });

    /*
     * 过去这条链接能直接读到私信全文——而且 markThreadRead 还会把它们标成
     * 已读，受害者连「有人看过」都察觉不到。
     */
    const response = await messagesGet(
      new Request(
        `https://example.test/api?account=${victim.id}&partner=${friend.id}`,
      ),
    );

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("只给张远看的内容。");
  });

  it("will not send a direct message as somebody else", async () => {
    const victim = makeAccount("victim@example.com", "张远");
    const target = makeAccount("target@example.com", "林曦");

    const response = await messagesPost(
      jsonRequest({
        account: victim.id,
        body: "冒充张远发的。",
        target: target.id,
      }),
    );

    expect(response.status).toBe(401);
  });

  it("will not follow on a victim's behalf", async () => {
    const victim = makeAccount("victim@example.com", "张远");
    const target = makeAccount("target@example.com", "林曦");

    const response = await followRoute(
      jsonRequest({ account: victim.id, following: true, target: target.id }),
    );

    expect(response.status).toBe(401);
  });

  it("will not hand over a victim's session view", async () => {
    const victim = makeAccount("victim@example.com", "张远");

    const response = await meRoute(
      new Request(`https://example.test/api?account=${victim.id}`),
    );
    const data = (await response.json()) as { account: unknown };

    /*
     * /me 未登录仍返回 200（公共内容不需要登录才能看），但绝不能因为查询串里
     * 写了别人的 id 就把那个人认成当前用户。
     */
    expect(response.status).toBe(200);
    expect(data.account).toBeNull();
  });

  it("will not hand a stranger the whole membership's email addresses", async () => {
    makeAccount("victim@example.com", "张远");
    makeAccount("second@example.com", "林曦");

    const response = await meRoute(new Request("https://example.test/api"));
    const data = (await response.json()) as {
      accounts: readonly Record<string, unknown>[];
    };

    /*
     * 这一条过去是成立的：不带任何令牌 `curl /api/social/me`，返回体里
     * 的 accounts 是全站账号，每一条都带真实邮箱，没有分页也没有条数上限。
     *
     * 后果不止是「邮箱泄漏」——登录接口特意统一回 401、注册接口特意不说
     * 邮箱是否已注册，都是为了挡住「探测某个邮箱有没有在站上注册过」。
     * 这个列表把那两处防护一起作废了。
     */
    expect(data.accounts.length).toBeGreaterThan(0);
    for (const account of data.accounts) {
      expect(account).not.toHaveProperty("email");
    }
    expect(JSON.stringify(data.accounts)).not.toContain("@example.com");
  });

  it("does not leak other members' emails to a signed-in member either", async () => {
    const self = makeAccount("self@example.com", "张远");
    makeAccount("other@example.com", "林曦");
    const token = issueSession(self.id, Date.now() / 1000) ?? "";

    const response = await meRoute(
      new Request("https://example.test/api", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    const data = (await response.json()) as {
      account: { email?: unknown } | null;
      accounts: readonly Record<string, unknown>[];
    };

    // 自己的邮箱要给——设置页上「当前登录邮箱」就靠它。
    expect(data.account?.email).toBe("self@example.com");
    // 别人的不给。登录了不等于有权翻别人的联系方式。
    expect(JSON.stringify(data.accounts)).not.toContain("other@example.com");
  });

  it("still serves the token holder their own session view", async () => {
    const account = makeAccount("self@example.com", "张远");
    const token = issueSession(account.id, Date.now() / 1000) ?? "";

    const response = await meRoute(
      new Request("https://example.test/api", {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    const data = (await response.json()) as { account: { id: string } | null };

    expect(data.account?.id).toBe(account.id);
  });
});

/*
 * 主页上的「回复」和「收藏」是本人可见的。
 *
 * 雪球那两个页签带锁图标，我此前的实现却把它们渲染给了所有人——一个人
 * 收藏过什么，等于他关注什么、在看什么，那是私事。
 *
 * 光在组件里隐藏不够：服务端渲染出来的数据仍然会随页面一起发出去，
 * 查看源码就能读到。所以这两块改成走这个鉴权接口取，页面本身不产出它们。
 */
describe("the locked tabs on a profile stay locked", () => {
  const getRequest = (token?: string): Request =>
    new Request("https://example.test/api/social/profile", {
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
    });

  it("refuses a visitor who is holding nothing but a public profile id", async () => {
    const victim = makeAccount("locked-victim@example.com", "张远");

    // 攻击者手上只有那个印在 /users/<id> 上的公开 id。
    const response = await profileGet(
      new Request(
        `https://example.test/api/social/profile?account=${victim.id}`,
      ),
    );

    expect(response.status).toBe(401);
  });

  it("refuses a signed-in visitor asking for somebody else's tabs", async () => {
    const victim = makeAccount("locked-owner@example.com", "张远");
    const intruder = makeAccount("locked-intruder@example.com", "李行");
    const token = issueSession(intruder.id, Date.now() / 1000) ?? "";

    /*
     * 登录了不等于有权限。查询串里换成受害者的 id，这一条必须失败——
     * 否则任何注册用户都能读走任何人的收藏夹。
     */
    const response = await profileGet(
      new Request(
        `https://example.test/api/social/profile?account=${victim.id}`,
        { headers: { authorization: `Bearer ${token}` } },
      ),
    );

    expect(response.status).toBe(403);
  });

  it("serves the token holder their own tabs", async () => {
    const owner = makeAccount("locked-self@example.com", "张远");
    const token = issueSession(owner.id, Date.now() / 1000) ?? "";

    const response = await profileGet(getRequest(token));
    const data = (await response.json()) as {
      bookmarks: readonly unknown[];
      replies: readonly unknown[];
    };

    /*
     * 不带 account 查询串也能拿到自己的——身份来自令牌，
     * 查询串从来不是身份的来源。
     */
    expect(response.status).toBe(200);
    expect(Array.isArray(data.replies)).toBe(true);
    expect(Array.isArray(data.bookmarks)).toBe(true);
  });
});

/*
 * 这一批新接口也要过同一张网。
 *
 * 组合和改邮箱都是「已登录才能做」的写操作。已登录不等于可以替别人做——
 * 请求体里塞一个别人的 id，必须没有任何效果。
 */
describe("the newer endpoints refuse to act for somebody else", () => {
  it("records a portfolio under the token holder, not the id in the body", async () => {
    const author = makeAccount("pf-token@example.com", "张远");
    const victim = makeAccount("pf-victim@example.com", "李行");
    const token = issueSession(author.id, Date.now() / 1000) ?? "";

    const response = await portfoliosPost(
      new Request("https://example.test/api/social/portfolios", {
        body: JSON.stringify({
          // 攻击者把受害者的公开 id 塞进请求体，指望接口信它。
          account: victim.id,
          holdings: [{ symbol: "sh600519", weight: 100 }],
          name: "冒名组合",
          ownerId: victim.id,
          summary: "",
        }),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const data = (await response.json()) as {
      portfolio?: { ownerId: string };
    };

    // 组合记在令牌持有者名下，请求体里的 id 一个字都不算数。
    expect(response.status).toBe(201);
    expect(data.portfolio?.ownerId).toBe(author.id);
  });

  it("will not move somebody else's login email", async () => {
    const attacker = makeAccount("mail-attacker@example.com", "张远");
    const victim = makeAccount("mail-victim@example.com", "李行");
    const token = issueSession(attacker.id, Date.now() / 1000) ?? "";

    const response = await emailPost(
      new Request("https://example.test/api/social/email", {
        body: JSON.stringify({
          // 连受害者的 id 带上都没用：身份只从令牌取。
          account: victim.id,
          current_password: "Correct-Horse-9",
          email: "stolen@example.com",
        }),
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    /*
     * 这一条会以攻击者自己的身份成功——那是他自己的账号，随他改。
     * 要紧的是受害者的邮箱纹丝不动。
     */
    expect(response.status).toBe(200);
    expect(getOwnAccount(victim.id)?.email).toBe("mail-victim@example.com");
  });
});
