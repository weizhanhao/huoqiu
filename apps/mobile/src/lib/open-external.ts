import { Linking } from "react-native";

/*
 * 打开一个站外地址。
 *
 * 站内八处「点开原文」原本都是 `void Linking.openURL(href)` ——而 openURL 是会
 * reject 的：地址打不开、没有 App 认这个协议、系统拒绝，都会抛。前面加个 void
 * 只是让类型检查闭嘴，异常照样跑出去，变成屏幕底下那条红条：
 *
 *   Uncaught (in promise, id: 0) Error: Unable to open URL: ...
 *
 * 那条红条盖住半个屏幕、说的是英文，而用户做的事只是点了一下「公告原文」。
 * 他既不知道发生了什么，也不知道该怎么办。
 *
 * 所以统一走这里：失败时给一句中文，并且把打不开的那个地址带上——公告和研报
 * 的原文在站外，地址本身是用户可以自己粘进浏览器的东西。
 */
export const openExternal = (
  url: string,
  onFail: (title: string, detail: string) => void,
): void => {
  void Linking.openURL(url).catch(() => {
    onFail("打不开这个链接", `系统没能打开：${url}`);
  });
};
