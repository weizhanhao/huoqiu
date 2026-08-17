import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { appTouchMinimum } from "../src/styles/app-touch";

/*
 * 每一个 Pressable 都要说清自己是什么。
 *
 * RN 里 Pressable 默认进无障碍树。于是两类写法各自出错，方向还相反：
 *
 *   1. 真按钮忘了写 accessibilityRole——VoiceOver 念出文字，但不说「按钮」，
 *      用户不知道这里能按；
 *   2. 只为「拦住触摸冒泡」而套的那一层 Pressable（弹层卡片、抽屉本体）
 *      本来就不是给人按的，可它照样能被聚焦，念出来是一个没有名字的按钮，
 *      罩住整张卡片——按下去什么都不发生。
 *
 * 第二类尤其隐蔽：看得见的界面完全正常，只有用读屏的人撞得到。它也不会让
 * 任何渲染用例变红，因为渲染结果确实是对的。
 *
 * 所以这道扫描要求：每个 Pressable 要么有 accessibilityRole，要么明确写
 * accessible={false} 退出无障碍树。两者都没有，就是没想过这个问题。
 *
 * 按文本扫，不解析 AST——不聪明，但拦得住下一个忘记写的人。
 */

const mobileRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/*
 * D0 与 five-tab 是早期的验收夹具，没有任何路由通到它们。
 * 它们有自己的一套用例，不在这道扫描的范围里。
 */
const EXCLUDED = ["/components/d0/", "/components/five-tab/"] as const;

const sourceFiles = (directory: string): readonly string[] => {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (entry.name.endsWith(".tsx")) found.push(path);
  }
  return found;
};

/** 每个 `<Pressable ...>` 开标签的全文。 */
const openingTags = (source: string): readonly string[] => {
  const tags: string[] = [];
  let at = source.indexOf("<Pressable");
  while (at !== -1) {
    const end = source.indexOf(">", at);
    tags.push(source.slice(at, end === -1 ? source.length : end));
    at = source.indexOf("<Pressable", at + 1);
  }
  return tags;
};

/** `<Pressable ...>` 开标签，连同它引用的 styles.xxx 名字。 */
const pressableStyles = (source: string): readonly string[] => {
  const names: string[] = [];
  for (const tag of openingTags(source)) {
    /* 带 hitSlop 的按钮自己扩了热区，视觉尺寸可以小于最小触达。 */
    if (tag.includes("hitSlop")) continue;
    for (const match of tag.matchAll(/styles\.(\w+)/gu)) {
      const name = match[1];
      if (name !== undefined) names.push(name);
    }
  }
  return names;
};

/** 某个样式声明里的 minHeight / height；没写高度时为 null。 */
const declaredHeight = (source: string, name: string): number | null => {
  const block = new RegExp(`\\n {2}${name}: \\{([\\s\\S]*?)\\n {2}\\},`, "u").exec(
    source,
  );
  if (block?.[1] === undefined) return null;
  if (block[1].includes("appTouchMinimum")) return appTouchMinimum;
  const size = /(?:minHeight|height): ([0-9.]+)/u.exec(block[1]);
  return size?.[1] === undefined ? null : Number(size[1]);
};

describe("pressables in the shipped app", () => {
  it("give every button a thumb-sized hit area", () => {
    /*
     * 44 是苹果的下限，我们取 48。差的这几点在设计稿上看不出来，在手上是
     * 「点了没反应，再点一次」——而第二次往往点到了旁边那一行。
     *
     * 视觉上必须做小的（名字旁边那颗「关注」），用 hitSlop 把热区撑开，
     * 而不是把按钮画大。
     */
    const offenders: string[] = [];

    for (const directory of ["src", "app"]) {
      for (const file of sourceFiles(join(mobileRoot, directory))) {
        if (EXCLUDED.some((part) => file.includes(part))) continue;
        const source = readFileSync(file, "utf8");
        const relative = file.slice(mobileRoot.length + 1);

        for (const name of pressableStyles(source)) {
          const height = declaredHeight(source, name);
          /*
           * 没写高度的样式跳过：那多半是整行卡片一类靠内容撑开的按钮，
           * 静态扫描量不出它们真实的高度，硬报只会逼人写假数字。
           */
          if (height === null) continue;
          if (height < appTouchMinimum) {
            offenders.push(`${relative} styles.${name} = ${String(height)}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("either declare a role or opt out of the accessibility tree", () => {
    const offenders: string[] = [];

    for (const directory of ["src", "app"]) {
      for (const file of sourceFiles(join(mobileRoot, directory))) {
        if (EXCLUDED.some((part) => file.includes(part))) continue;
        const source = readFileSync(file, "utf8");
        const relative = file.slice(mobileRoot.length + 1);

        for (const tag of openingTags(source)) {
          const declared =
            tag.includes("accessibilityRole") ||
            tag.includes("accessible={false}");
          if (!declared) offenders.push(`${relative}: ${tag.slice(0, 60)}…`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
