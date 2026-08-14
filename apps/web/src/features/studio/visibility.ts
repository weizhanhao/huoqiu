/*
 * 分享范围。
 *
 * 从存储层单独抄一份到客户端：存储层是 *.server 用的模块，客户端组件
 * 直接引它会把 node:fs 一起打进浏览器包。
 */
export const postVisibilities = ["public", "followers", "private"] as const;
export type PostVisibility = (typeof postVisibilities)[number];
