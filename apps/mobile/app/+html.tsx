import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

/*
 * Web 导出时的文档外壳。手机上的原生运行不经过这里。
 *
 * 这里原先用 useServerDocumentContext() 取 head/body 节点——那个导出只在
 * 较新的 expo-router 里有。SDK 54 由框架自己注入这些节点，外壳只负责声明
 * 语言、视口和滚动重置。
 */
export default function HtmlDocument({ children }: PropsWithChildren) {
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        {/*
          原生里 body 不滚动，Web 里会。不重置的话，导出的网页版会出现
          两层滚动条，里外各滚各的。
        */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
