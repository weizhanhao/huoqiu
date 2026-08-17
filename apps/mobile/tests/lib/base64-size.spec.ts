import { describe, expect, it } from "vitest";

import { decodedBytes } from "../../src/lib/base64-size";

/*
 * 上传前的大小换算。
 *
 * 服务端卡的是解码后的字节数（512 KB），而手上只有 base64 字符串。算错的两种
 * 后果都不容易被发现：算大了，明明能传的图被本地拦下来，用户以为图有问题；
 * 算小了，压缩那几档全部通过，然后服务端退回来——白等一场。
 */

const base64Of = (text: string): string =>
  Buffer.from(text, "utf8").toString("base64");

describe("decoded bytes", () => {
  it("matches the real byte length across every padding case", () => {
    /*
     * 这几个长度覆盖 base64 的三种补位：无 =、一个 =、两个 =。只测一种的话，
     * 漏减补位的写法有很大概率照样通过。
     */
    for (const text of ["abc", "abcd", "abcde", "a", "ab"]) {
      expect(decodedBytes(base64Of(text))).toBe(
        Buffer.from(text, "utf8").byteLength,
      );
    }
  });

  it("does not overestimate a padded payload into rejection", () => {
    /* "a" 编码成 "YQ=="，四个字符；按 4/3 直算会得 3，而它只有 1 字节。 */
    expect(decodedBytes("YQ==")).toBe(1);
  });
});
