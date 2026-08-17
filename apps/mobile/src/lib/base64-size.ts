/*
 * base64 字符串解码后有多少字节。
 *
 * 单独一个文件，是因为它要能在 Node 下被直接测——和它同处一个文件的选图流程
 * 一 import 就会拉起 expo 的原生模块，而那些模块在测试进程里根本装不起来。
 * 为一段纯算术把整支用例连累到跑不了，不值得。
 *
 * 上传前用它和服务端的 512 KB 上限比。算大了，明明能传的图被本地拦下来，
 * 用户以为图有问题；算小了，压缩那几档全通过，然后服务端退回来——白等一场。
 */

/** base64 每 4 个字符对应 3 字节，末尾的 = 是补位，不算数据。 */
export const decodedBytes = (base64: string): number => {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
};
