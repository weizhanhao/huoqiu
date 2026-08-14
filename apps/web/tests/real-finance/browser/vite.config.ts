import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));

export default {
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "next/link": fileURLToPath(
        new URL("../../community/browser/next-link.tsx", import.meta.url),
      ),
      /*
       * 外壳的导航选中态从地址推，用到了 usePathname。没有这层垫片，
       * Vite 会去解析真正的 next/navigation，在没有路由上下文时侧栏整块
       * 渲染不出来——症状是版面宽度对不上，不是一句明确的报错。
       */
      "next/navigation": fileURLToPath(
        new URL("./next-navigation.ts", import.meta.url),
      ),
    },
  },
  root,
};
