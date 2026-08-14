import type { Metadata } from "next";
import Link from "next/link";

import { DesktopShell } from "../components/shell/desktop-shell";

export const metadata: Metadata = {
  description: "页面不存在",
  title: "页面不存在 · 火球",
};

/*
 * 404。
 *
 * 之前没有这个文件，乱输一个地址会落到 Next 的英文默认页——在一个中文
 * 产品里那是最明显的「没做完」。这里保留完整外壳，用户可以直接从导航
 * 继续走，而不是撞进死胡同再点浏览器后退。
 */
export default function NotFound() {
  return (
    <DesktopShell>
      <section className="page-message">
        <h1>没有找到这个页面</h1>
        <p>
          地址可能输错了，或者这条内容已经不在了。下面几个入口可以直接继续。
        </p>
        <div className="page-message-actions">
          <Link href="/">回到首页</Link>
          <Link href="/community">去社区</Link>
          <Link href="/markets">看行情</Link>
          <Link href="/search">搜索</Link>
        </div>
      </section>
    </DesktopShell>
  );
}
