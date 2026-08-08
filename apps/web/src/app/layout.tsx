import { cssVariables } from "@huoqiu/web-ui";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "火球",
  description: "公开市场信息的观察与整理",
};

type RootLayoutProperties = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProperties) {
  return (
    <html lang="zh-CN">
      <head>
        <style dangerouslySetInnerHTML={{ __html: cssVariables }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
