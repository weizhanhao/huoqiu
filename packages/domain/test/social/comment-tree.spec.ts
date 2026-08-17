import { describe, expect, it } from "vitest";

import {
  buildCommentTree,
  replyTargetOf,
} from "../../src/social/comment-tree.js";

/*
 * 评论树。
 *
 * 这段的失败方式是「安静地少显示一条」——页面照常渲染，没有报错，只有发的
 * 那个人发现自己的回复不见了。所以这里守的都是「某条评论会不会消失」。
 */

type Row = Readonly<{
  authorName: string;
  createdAt: string;
  id: string;
  parentId?: string;
}>;

const row = (id: string, createdAt: string, parentId?: string): Row => ({
  authorName: id,
  createdAt,
  id,
  ...(parentId === undefined ? {} : { parentId }),
});

const idsOf = (rows: readonly Row[]): readonly string[] =>
  rows.map((entry) => entry.id);

describe("comment tree", () => {
  it("keeps a reply to a reply under the same top-level comment", () => {
    /*
     * 这正是网页版那份一层分组丢掉的东西：c 回复 b，b 回复 a。只认「父就是
     * 顶层」的话，c 既不在顶层，也不在 a 的回复里，整条从页面上消失。
     */
    const tree = buildCommentTree([
      row("a", "2026-08-17T01:00:00.000Z"),
      row("b", "2026-08-17T02:00:00.000Z", "a"),
      row("c", "2026-08-17T03:00:00.000Z", "b"),
    ]);

    expect(idsOf(tree.map((node) => node.comment))).toEqual(["a"]);
    expect(idsOf(tree[0]?.replies ?? [])).toEqual(["b", "c"]);
  });

  it("shows an orphaned reply instead of dropping it", () => {
    /*
     * 父评论被删掉、或分页只取回一段时会出现孤儿。当顶层显示至少读得到，
     * 直接丢掉的话，发的人会以为服务把自己的话吞了。
     */
    const tree = buildCommentTree([
      row("a", "2026-08-17T01:00:00.000Z"),
      row("orphan", "2026-08-17T02:00:00.000Z", "missing"),
    ]);

    expect(idsOf(tree.map((node) => node.comment))).toEqual(["a", "orphan"]);
  });

  it("does not hang when parentId links form a cycle", () => {
    /* 数据不该成环，但这段在渲染路径上：转不出来就是一片白屏。 */
    const tree = buildCommentTree([
      row("x", "2026-08-17T01:00:00.000Z", "y"),
      row("y", "2026-08-17T02:00:00.000Z", "x"),
    ]);

    expect(tree.length).toBeGreaterThan(0);
    expect(
      [
        ...idsOf(tree.map((node) => node.comment)),
        ...idsOf(tree[0]?.replies ?? []),
      ].sort(),
    ).toEqual(["x", "y"]);
  });

  it("orders replies from oldest to newest regardless of input order", () => {
    const tree = buildCommentTree([
      row("a", "2026-08-17T01:00:00.000Z"),
      row("late", "2026-08-17T05:00:00.000Z", "a"),
      row("early", "2026-08-17T02:00:00.000Z", "a"),
    ]);

    expect(idsOf(tree[0]?.replies ?? [])).toEqual(["early", "late"]);
  });

  it("names the person being replied to only when it is not the top comment", () => {
    const rows = [
      row("a", "2026-08-17T01:00:00.000Z"),
      row("b", "2026-08-17T02:00:00.000Z", "a"),
      row("c", "2026-08-17T03:00:00.000Z", "b"),
    ];
    const byId = new Map(rows.map((entry) => [entry.id, entry]));
    const root = rows[0] as Row;

    expect(replyTargetOf(rows[1] as Row, root, byId)).toBeNull();
    expect(replyTargetOf(rows[2] as Row, root, byId)?.id).toBe("b");
  });
});
