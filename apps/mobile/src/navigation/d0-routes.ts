/*
 * 移动端的路由真值表。
 *
 * 页签构成按参考图（docs/app-reference/tab-*.png）：火球 / 自选 / 基金 / 私募 / 我的。
 *
 * 此前是「火球/自选/行情/组合/我的」——把行情和组合摆成了独立页签，而参考图里
 * 它们是「自选」页签内部的顶部分段。归属错了，下面每一页该挂在哪儿就都跟着错，
 * 所以先把结构改对。
 */
export const d0RuntimeRoutes = Object.freeze({
  stack: Object.freeze([
    Object.freeze({ href: "/search", label: "搜索" }),
    Object.freeze({ href: "/instrument/[listingId]", label: "标的详情" }),
    Object.freeze({ href: "/portfolio/[portfolioId]", label: "组合详情" }),
    Object.freeze({ href: "/messages", label: "消息" }),
    Object.freeze({ href: "/settings", label: "设置" }),
  ]),
  tabs: Object.freeze([
    Object.freeze({ href: "/home", label: "火球" }),
    Object.freeze({ href: "/watchlist", label: "自选" }),
    Object.freeze({ href: "/fund", label: "基金" }),
    Object.freeze({ href: "/private-fund", label: "私募" }),
    Object.freeze({ href: "/profile", label: "我的" }),
  ]),
});
