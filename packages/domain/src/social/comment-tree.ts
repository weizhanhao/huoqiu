/*
 * 把一张平表的评论拼成「顶层评论 + 它下面的回复」两层。
 *
 * 服务端存的是平表，每条评论用 parentId 指向被回复的那条，深度不限。但页面只
 * 画两层：回复的回复也归到同一条顶层评论下面，像参考图里那样在灰底块里依次
 * 列出。真按深度缩进，第四层往后就只剩两个字一行了。
 *
 * 放共享包是因为网页版和手机版会分头写一遍，而网页那份（只取 parentId 直接
 * 等于顶层 id 的）会让回复的回复整条不显示——发的人看不到自己刚发的东西。
 *
 * 这里守三件事：
 *   - 找不到父评论的，当顶层显示。凭空消失比多显示一条更糟。
 *   - parentId 成环时不死循环。数据不该成环，但这段在渲染路径上，转不出来
 *     就是白屏。
 *   - 顶层保持传入顺序，回复各自按时间从早到晚。
 */

/** 拼树只需要这三个字段，别的（正文、作者）由调用方自己带着。 */
export type TreeComment = Readonly<{
  createdAt: string;
  id: string;
  parentId?: string;
}>;

export type CommentNode<T extends TreeComment> = Readonly<{
  comment: T;
  /** 挂在这条顶层评论下的全部回复，含回复的回复，按时间从早到晚。 */
  replies: readonly T[];
}>;

/*
 * 顺着 parentId 往上找顶层。
 *
 * 断链（父不存在）时停在当前这一环上——那一环自己会成为顶层，这条就挂在它
 * 下面，两条都还在。
 *
 * 成环时必须回自己，不能回停下来的那一环：x 和 y 互为父的话，回「停下来的
 * 那一环」会让 x 认 y 当顶层、y 认 x 当顶层，于是谁都不是顶层，两条一起从
 * 页面上消失。回自己则两条都当顶层显示——多显示一层缩进，好过静悄悄少两条。
 */
const rootIdOf = <T extends TreeComment>(
  comment: T,
  byId: ReadonlyMap<string, T>,
): string => {
  const seen = new Set<string>([comment.id]);
  let current = comment;
  while (current.parentId !== undefined) {
    const parent = byId.get(current.parentId);
    if (parent === undefined) return current.id;
    if (seen.has(parent.id)) return comment.id;
    seen.add(parent.id);
    current = parent;
  }
  return current.id;
};

export const buildCommentTree = <T extends TreeComment>(
  comments: readonly T[],
): readonly CommentNode<T>[] => {
  const byId = new Map(comments.map((comment) => [comment.id, comment]));
  const replies = new Map<string, T[]>();
  const roots: T[] = [];

  for (const comment of comments) {
    const rootId = rootIdOf(comment, byId);
    if (rootId === comment.id) {
      roots.push(comment);
      continue;
    }
    const bucket = replies.get(rootId);
    if (bucket === undefined) replies.set(rootId, [comment]);
    else bucket.push(comment);
  }

  return roots.map((comment) => ({
    comment,
    replies: (replies.get(comment.id) ?? []).sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    ),
  }));
};

/*
 * 一条回复是回给谁的。
 *
 * 两层结构下，「回复 @某某」这个前缀是读者判断回复对象的唯一线索——没有它，
 * 一堆平铺的回复读起来像各说各话。回给顶层那条时不加：谁都看得出来。
 */
export const replyTargetOf = <T extends TreeComment>(
  reply: T,
  root: T,
  byId: ReadonlyMap<string, T>,
): T | null => {
  if (reply.parentId === undefined) return null;
  const parent = byId.get(reply.parentId);
  if (parent === undefined || parent.id === root.id) return null;
  return parent;
};
