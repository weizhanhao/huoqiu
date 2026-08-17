/*
 * 发帖框工具栏的记号工具。
 *
 * 记号的写法与解析已经搬到 @huoqiu/domain/social/post-body——网页版和手机端
 * 必须用同一份。留在这里再导出，是为了不改动本目录下已有的 import 路径；
 * 真正的实现只有一处。
 */

export {
  cashtagToken,
  imageToken,
  mentionToken,
  parsePostBody,
  topicToken,
  uploadPrefix,
  type MentionAccount,
  type PostSegment,
} from "@huoqiu/domain/social/post-body";

/**
 * 在光标处插入。
 *
 * 一律追加到末尾的话，光标停在句中时插出来的东西会跑到最后，用户得自己
 * 剪切再粘回去。有选区就替换选区——这是所有输入框的既有行为。
 */
export const insertAtCursor = (
  value: string,
  selectionStart: number,
  selectionEnd: number,
  insert: string,
): Readonly<{ caret: number; value: string }> => ({
  caret: selectionStart + insert.length,
  value: value.slice(0, selectionStart) + insert + value.slice(selectionEnd),
});
