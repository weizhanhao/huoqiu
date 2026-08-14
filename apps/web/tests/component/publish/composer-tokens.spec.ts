import { describe, expect, it } from "vitest";

import {
  cashtagToken,
  imageToken,
  insertAtCursor,
  mentionToken,
  parsePostBody,
  topicToken,
} from "../../../src/features/publish/composer-tokens";

/*
 * 发帖框工具栏插进正文的那几种记号，以及正文渲染时把它们认回来。
 *
 * 插入和解析必须是一对。只插不解析，用户在框里选了一只股票，发出来是一串
 * 「$贵州茅台(SH600519)$」的字面量，点不开——那就是个装样子的按钮。
 * 只解析不插入同样没用。所以两边写在一个文件里，用同一组记号互相咬住。
 */

describe("inserting at the caret", () => {
  it("puts the text where the caret is, not at the end", () => {
    /*
     * 一律追加到末尾的话，光标停在句中时插出来的东西会跑到最后——
     * 用户得自己剪切再粘回去。
     */
    const result = insertAtCursor("今天看好", 2, 2, "😀");
    expect(result.value).toBe("今天😀看好");
    // 光标要落在插入内容之后，接着能继续打字。
    expect(result.caret).toBe(2 + "😀".length);
  });

  it("replaces the selection instead of keeping both", () => {
    const result = insertAtCursor("今天看好", 2, 4, "谨慎");
    expect(result.value).toBe("今天谨慎");
  });
});

describe("token shapes", () => {
  it("writes a cashtag the way the parser reads it back", () => {
    const token = cashtagToken("贵州茅台", "sh600519");
    const segments = parsePostBody(token, { accounts: [], topics: [] });

    expect(segments).toEqual([
      {
        href: "/instruments/sh600519",
        kind: "cashtag",
        text: "$贵州茅台(SH600519)$",
      },
    ]);
  });

  it("writes a topic the way the parser reads it back", () => {
    const token = topicToken("证据链");
    const segments = parsePostBody(token, {
      accounts: [],
      topics: ["证据链"],
    });

    expect(segments).toEqual([
      {
        href: "/topics/%E8%AF%81%E6%8D%AE%E9%93%BE",
        kind: "topic",
        text: "#证据链#",
      },
    ]);
  });

  it("links a mention only when exactly one account owns that name", () => {
    /*
     * 重名时不链接，而不是随便挑一个。挑错了是把读者送到另一个人的主页上，
     * 而链接看起来完全正常——这种错没人报得出来。
     */
    const accounts = [
      { displayName: "张远", id: "acc_1" },
      { displayName: "张远", id: "acc_2" },
      { displayName: "李四", id: "acc_3" },
    ];

    expect(
      parsePostBody(mentionToken("李四"), { accounts, topics: [] }),
    ).toEqual([
      { href: "/users/acc_3", kind: "mention", text: "@李四" },
      { kind: "text", text: " " },
    ]);

    expect(parsePostBody("@张远", { accounts, topics: [] })).toEqual([
      { kind: "text", text: "@张远" },
    ]);
  });

  it("renders an uploaded image as an image, not as its own address", () => {
    const token = imageToken("/api/social/uploads/abc123.png");
    expect(parsePostBody(token, { accounts: [], topics: [] })).toEqual([
      { kind: "image", src: "/api/social/uploads/abc123.png" },
    ]);
  });
});

describe("parsing a whole post", () => {
  it("keeps the surrounding words and only marks up the tokens", () => {
    const body = `今天看 ${cashtagToken("贵州茅台", "sh600519")} 的 ${topicToken(
      "证据链",
    )}`;
    const segments = parsePostBody(body, {
      accounts: [],
      topics: ["证据链"],
    });

    expect(segments.map((segment) => segment.kind)).toEqual([
      "text",
      "cashtag",
      "text",
      "topic",
    ]);
    expect(segments[0]).toEqual({ kind: "text", text: "今天看 " });
  });

  it("leaves an unknown topic as plain text", () => {
    /*
     * 话题广场里没有的标签不给链接——链过去是一页空的，读者会以为
     * 这个话题下什么都没发生过，而其实是这个话题根本不存在。
     */
    const segments = parsePostBody(topicToken("不存在的话题"), {
      accounts: [],
      topics: ["证据链"],
    });
    expect(segments).toEqual([{ kind: "text", text: "#不存在的话题#" }]);
  });

  it("only treats a real symbol shape as a stock", () => {
    /*
     * 括号里不是证券代码就不给链接。放开成「括号里的任何东西」，
     * 「$我的组合(自定义)$」会链到 /instruments/自定义——一条死路，
     * 而它在正文里看着和真的股票链接一模一样。
     */
    const segments = parsePostBody("$我的组合(自定义)$", {
      accounts: [],
      topics: [],
    });
    expect(segments).toEqual([{ kind: "text", text: "$我的组合(自定义)$" }]);

    // 港股与美股的代码形状也要认得，别只认 A 股。
    expect(
      parsePostBody(cashtagToken("腾讯控股", "hk00700"), {
        accounts: [],
        topics: [],
      })[0],
    ).toEqual({
      href: "/instruments/hk00700",
      kind: "cashtag",
      text: "$腾讯控股(HK00700)$",
    });
    expect(
      parsePostBody(cashtagToken("苹果", "AAPL"), {
        accounts: [],
        topics: [],
      })[0],
    ).toEqual({
      href: "/instruments/aapl",
      kind: "cashtag",
      text: "$苹果(AAPL)$",
    });
  });

  it("does not turn a bare dollar amount into a stock link", () => {
    // 「$100」不是股票记号，链到 /instruments/100 是条死路。
    const segments = parsePostBody("成本 $100 左右", {
      accounts: [],
      topics: [],
    });
    expect(segments).toEqual([{ kind: "text", text: "成本 $100 左右" }]);
  });
});
