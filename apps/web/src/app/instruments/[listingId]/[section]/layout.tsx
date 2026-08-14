import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import {
  findInstrumentSection,
  isCompanyListing,
} from "../../../../features/real-finance/instrument-sections";
import { resolveListing } from "../../../../features/real-finance/resolve-listing.server";

/*
 * 分区路由的校验层。
 *
 * 这三条判断本来在 page 里。加了 loading.tsx 之后必须上移一层——
 * loading 会在 layout 的 children 外面裹一层 Suspense，而 notFound()
 * 一旦落在 Suspense 之下，外壳已经开始流式输出，HTTP 状态码就定成 200 了：
 * 页面上写着 404，响应头说一切正常。界面上完全看不出来，搜索引擎和任何
 * 按状态码判断的调用方全被骗过去。
 *
 * layout 在那层 Suspense 之外，所以校验放这里，骨架和正确的 404 才能并存。
 */
export default async function SectionLayout({
  children,
  params,
}: Readonly<{
  children: ReactNode;
  params: Promise<Readonly<{ listingId: string; section: string }>>;
}>) {
  const { listingId, section: slug } = await params;

  const section = findInstrumentSection(slug);
  if (section === null || section.status !== "ready") {
    notFound();
  }

  /*
   * 指数没有公司简介、没有高管、没有十大股东。硬渲染出来是一片空白，
   * 而空白读起来像「这个标的没披露」，不像「这个标的根本没有这种东西」。
   */
  if (!isCompanyListing(listingId)) {
    notFound();
  }

  /*
   * 代码在上游确实存在才继续。resolveListing 被 React.cache 包着，
   * 上一层 layout 刚问过，这里不会再打一次上游。
   */
  if ((await resolveListing(listingId)) === null) {
    notFound();
  }

  return <>{children}</>;
}
