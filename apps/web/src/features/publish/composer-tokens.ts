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
  insertAtCursor,
  mentionToken,
  parsePostBody,
  topicToken,
  uploadPrefix,
  type MentionAccount,
  type PostSegment,
} from "@huoqiu/domain/social/post-body";
