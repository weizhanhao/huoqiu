/*
 * 这套浏览器靶站用 Vite 直接跑真实组件，没有 Next 运行时，所以路由接口要
 * 自己垫一层——和隔壁的 next-link.tsx 同一个道理。
 *
 * 导航选中态现在从地址推（见 src/components/shell/active-nav.ts），外壳因此
 * 用上了 usePathname。不垫这一层，Vite 会去解析真正的 next/navigation，
 * 在没有路由上下文的情况下拿不到东西，侧栏整块渲染不出来——表现出来是
 * 版面宽度对不上，而不是一句明确的报错。
 */

/** 本靶站渲染的是这一页，路径固定。 */
export const usePathname = (): string => "/portfolios";

export const useSearchParams = (): URLSearchParams => new URLSearchParams();

export const useRouter = () => ({
  back: () => undefined,
  forward: () => undefined,
  prefetch: () => undefined,
  push: () => undefined,
  refresh: () => undefined,
  replace: () => undefined,
});
