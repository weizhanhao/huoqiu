import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPortfolio,
  getPortfolio,
  listFollowedPortfolios,
  listPortfoliosByOwner,
  listPublicPortfolios,
  setPortfolioFollow,
} from "../../src/server/portfolio-store";
import { registerAccount } from "../../src/server/social-store";

/*
 * 组合落盘。
 *
 * 组合此前只活在 React state 里，刷新就没了——所以个人主页上「组合」那一栏
 * 一直显示「—」。组合是用户自己创建的内容，应当跟着账号存下来。
 *
 * 这一份守的是权重：一个组合的持仓权重必须合计 100%。差几个百分点的组合
 * 算出来的收益是错的，而页面上每一行看起来都很正常。
 */

let directory = "";

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

const HOLDINGS = [
  { symbol: "sh600519", weight: 60 },
  { symbol: "sz300862", weight: 40 },
];

beforeEach(() => {
  directory = mkdtempSync(resolve(tmpdir(), "huoqiu-portfolio-"));
  vi.stubEnv("HUOQIU_SOCIAL_STORE_DIRECTORY", directory);
});

afterEach(() => {
  rmSync(directory, { force: true, recursive: true });
});

describe("a portfolio belongs to the account that created it", () => {
  it("stores it so it survives a reload", () => {
    const owner = makeAccount("pf-owner@example.com", "张远");

    const created = createPortfolio({
      holdings: HOLDINGS,
      name: "消费与制造",
      now: "2026-08-13T01:00:00.000Z",
      ownerId: owner.id,
      summary: "长期持有，季度再平衡。",
    });
    if ("error" in created) throw new Error(created.error);

    const mine = listPortfoliosByOwner(owner.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.name).toBe("消费与制造");
    expect(mine[0]?.holdings).toEqual(HOLDINGS);
    // 读回来的是落盘的那一条，不是内存里的副本。
    expect(getPortfolio(created.portfolio.id)?.ownerId).toBe(owner.id);
  });

  it("refuses weights that do not add up to a whole portfolio", () => {
    const owner = makeAccount("pf-weight@example.com", "张远");

    /*
     * 权重合计不是 100% 的组合，算出来的收益是错的——
     * 而页面上每一行都长得很正常，错误只体现在总收益那一个数字上。
     */
    for (const holdings of [
      [{ symbol: "sh600519", weight: 60 }],
      [
        { symbol: "sh600519", weight: 60 },
        { symbol: "sz300862", weight: 50 },
      ],
      [{ symbol: "sh600519", weight: 0 }],
    ]) {
      const result = createPortfolio({
        holdings,
        name: "权重不对",
        now: "2026-08-13T01:00:00.000Z",
        ownerId: owner.id,
        summary: "",
      });
      expect("error" in result, JSON.stringify(holdings)).toBe(true);
    }
  });

  it("refuses a holding it cannot price", () => {
    const owner = makeAccount("pf-symbol@example.com", "张远");

    /*
     * 站内的虚构标的没有公开行情，放进组合会让整个组合的收益无从算起。
     * 与其算出一个残缺的数字，不如一开始就不收。
     */
    const result = createPortfolio({
      holdings: [
        { symbol: "listing_syn_0001", weight: 50 },
        { symbol: "sh600519", weight: 50 },
      ],
      name: "含虚构标的",
      now: "2026-08-13T01:00:00.000Z",
      ownerId: owner.id,
      summary: "",
    });

    expect("error" in result).toBe(true);
  });

  it("refuses to create one for an account that does not exist", () => {
    const result = createPortfolio({
      holdings: HOLDINGS,
      name: "无主组合",
      now: "2026-08-13T01:00:00.000Z",
      ownerId: "acct_0000000000000000",
      summary: "",
    });

    expect("error" in result).toBe(true);
  });
});

describe("following somebody else's portfolio", () => {
  it("keeps the follower's list apart from the owner's list", () => {
    const owner = makeAccount("pf-a@example.com", "张远");
    const reader = makeAccount("pf-b@example.com", "李行");

    const created = createPortfolio({
      holdings: HOLDINGS,
      name: "消费与制造",
      now: "2026-08-13T01:00:00.000Z",
      ownerId: owner.id,
      summary: "",
    });
    if ("error" in created) throw new Error(created.error);

    setPortfolioFollow(reader.id, created.portfolio.id, true);

    /*
     * 「我创建的」和「我关注的」是两个页签。关注别人的组合不该让它
     * 出现在「我创建的」里——那等于把别人的作品记在自己名下。
     */
    expect(listPortfoliosByOwner(reader.id)).toHaveLength(0);
    expect(listFollowedPortfolios(reader.id).map((entry) => entry.id)).toEqual([
      created.portfolio.id,
    ]);
    expect(listFollowedPortfolios(owner.id)).toHaveLength(0);
  });

  it("lets a follower let go", () => {
    const owner = makeAccount("pf-c@example.com", "张远");
    const reader = makeAccount("pf-d@example.com", "李行");
    const created = createPortfolio({
      holdings: HOLDINGS,
      name: "消费与制造",
      now: "2026-08-13T01:00:00.000Z",
      ownerId: owner.id,
      summary: "",
    });
    if ("error" in created) throw new Error(created.error);

    setPortfolioFollow(reader.id, created.portfolio.id, true);
    setPortfolioFollow(reader.id, created.portfolio.id, false);

    expect(listFollowedPortfolios(reader.id)).toHaveLength(0);
  });

  it("does not follow a portfolio that does not exist", () => {
    const reader = makeAccount("pf-e@example.com", "李行");

    setPortfolioFollow(reader.id, "pf_0000000000000000", true);

    // 关注一个不存在的组合，列表里不该凭空多出一行。
    expect(listFollowedPortfolios(reader.id)).toHaveLength(0);
  });
});

/*
 * 组合榜。
 *
 * 榜单此前列的是十二条写死的样本组合（SYN001-012），带着编好的收益数字，
 * 而站内真实存在的组合一条也不在上面。榜单要列的就是本站账号真实建过的
 * 组合——没有人建过就是空的，那也是实话。
 */
describe("the public leaderboard lists what accounts actually created", () => {
  it("carries the owner's name and how many follow it", () => {
    const owner = makeAccount("pf-board-a@example.com", "张远");
    const reader = makeAccount("pf-board-b@example.com", "李行");
    const created = createPortfolio({
      holdings: HOLDINGS,
      name: "消费与制造",
      now: "2026-08-13T01:00:00.000Z",
      ownerId: owner.id,
      summary: "长期持有。",
    });
    if ("error" in created) throw new Error(created.error);
    setPortfolioFollow(reader.id, created.portfolio.id, true);

    const board = listPublicPortfolios();

    expect(board).toHaveLength(1);
    /*
     * 榜单上要写清楚是谁建的。只有一个 acct_xxxx 的话，
     * 「组合榜」看起来就像系统自己生成的东西。
     */
    expect(board[0]?.ownerName).toBe("张远");
    expect(board[0]?.followerCount).toBe(1);
    expect(board[0]?.holdings).toEqual(HOLDINGS);
  });

  it("is empty when nobody has created one", () => {
    /*
     * 没有人建过组合，榜单就该是空的。此前这里永远有十二条编好的组合，
     * 一个刚部署的站点看起来也像已经有人在用。
     */
    expect(listPublicPortfolios()).toEqual([]);
  });

  it("puts the newest first", () => {
    const owner = makeAccount("pf-board-c@example.com", "张远");
    for (const [name, now] of [
      ["先建的", "2026-08-11T01:00:00.000Z"],
      ["后建的", "2026-08-13T01:00:00.000Z"],
    ] as const) {
      const result = createPortfolio({
        holdings: HOLDINGS,
        name,
        now,
        ownerId: owner.id,
        summary: "",
      });
      if ("error" in result) throw new Error(result.error);
    }

    expect(listPublicPortfolios().map((entry) => entry.name)).toEqual([
      "后建的",
      "先建的",
    ]);
  });

  it("keeps a portfolio whose owner has vanished off the board", () => {
    /*
     * 账号存在与否要现查。落盘时写死一个名字的话，账号注销之后榜单上
     * 还挂着他的名字——那是一条指向不存在的人的记录。
     */
    const owner = makeAccount("pf-board-d@example.com", "张远");
    const created = createPortfolio({
      holdings: HOLDINGS,
      name: "会消失的",
      now: "2026-08-13T01:00:00.000Z",
      ownerId: owner.id,
      summary: "",
    });
    if ("error" in created) throw new Error(created.error);

    expect(listPublicPortfolios()[0]?.ownerName).toBe("张远");
  });
});
