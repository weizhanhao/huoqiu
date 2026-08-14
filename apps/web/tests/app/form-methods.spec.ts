import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/*
 * 带 onSubmit 的表单必须显式声明 method。
 *
 * 这是部署到服务器之后才暴露出来的：注册页写的是 `<form onSubmit={submit}>`，
 * 没有 method。水合完成之前点提交，React 的处理器还没挂上，浏览器就执行
 * 原生提交——而表单默认方法是 GET，于是
 *
 *   POST /api/social/register       （本该如此）
 *   GET  /register?password=明文…    （实际发生的）
 *
 * 密码进了地址栏、Referer 头和 nginx 访问日志。日志原样记着：
 *
 *   referrer: "http://…/register?display_name=…&password=Correct-Horse-…"
 *
 * 本机开发看不到这件事：水合快得抢在点击之前。网络一慢就必然发生，
 * 而且发生时界面上没有任何异常——页面只是「刷新了一下」。
 *
 * 声明 method="post" 之后，同样的抢跑变成一次 POST：字段在请求体里，
 * 不进 URL、不进日志、不进 Referer。
 */

const sourceRoot = fileURLToPath(new URL("../../src/", import.meta.url));

const collectSources = async (
  directory: string,
  into: string[],
): Promise<void> => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      await collectSources(`${directory}${entry.name}/`, into);
    } else if (entry.name.endsWith(".tsx")) {
      into.push(`${directory}${entry.name}`);
    }
  }
};

/** 取出每个 <form …> 开标签的完整属性文本。 */
const formTags = (source: string): readonly string[] => {
  const tags: string[] = [];
  let index = source.indexOf("<form");
  while (index !== -1) {
    /*
     * 属性里可能有含 ">" 的表达式（箭头函数），所以按花括号深度找结束，
     * 不是找第一个 ">"。
     */
    let depth = 0;
    let cursor = index;
    while (cursor < source.length) {
      const character = source[cursor];
      if (character === "{") depth += 1;
      else if (character === "}") depth -= 1;
      else if (character === ">" && depth === 0) break;
      cursor += 1;
    }
    tags.push(source.slice(index, cursor + 1));
    index = source.indexOf("<form", cursor);
  }
  return tags;
};

describe("forms never fall back to a GET that carries the fields in the URL", () => {
  it("declares an explicit method on every form with an onSubmit handler", async () => {
    const files: string[] = [];
    await collectSources(sourceRoot, files);

    const offenders: string[] = [];
    let checked = 0;

    for (const file of files) {
      const source = await readFile(file, "utf8");
      for (const tag of formTags(source)) {
        if (!tag.includes("onSubmit")) continue;
        checked += 1;
        if (/\smethod=/u.test(tag)) continue;
        const line = source.slice(0, source.indexOf(tag)).split("\n").length;
        offenders.push(`${file.slice(sourceRoot.length)}:${line}`);
      }
    }

    /*
     * 守卫本身失效时要看得出来：一个带 onSubmit 的表单都没找到，
     * 下面的断言会永远通过。
     */
    expect(checked).toBeGreaterThan(5);
    expect(offenders).toEqual([]);
  });

  it("keeps every credential-carrying form on POST", async () => {
    /*
     * 上一条只要求「写了 method」。这一条盯住真正要命的那几个：
     * 表单里有密码输入框，方法就必须是 post——写成 get 等于把密码直接
     * 放进地址栏。
     */
    const files: string[] = [];
    await collectSources(sourceRoot, files);

    const offenders: string[] = [];
    let checked = 0;

    for (const file of files) {
      const source = await readFile(file, "utf8");
      if (!source.includes('type="password"')) continue;
      for (const tag of formTags(source)) {
        if (!tag.includes("onSubmit")) continue;
        checked += 1;
        if (/\smethod="post"/u.test(tag)) continue;
        const line = source.slice(0, source.indexOf(tag)).split("\n").length;
        offenders.push(`${file.slice(sourceRoot.length)}:${line}`);
      }
    }

    expect(checked).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });
});
