import { SiteTopbar } from "./site-topbar";

/*
 * 历史首页壳的兼容出口。
 *
 * 顶栏不再维护第二套搜索、消息和设置逻辑：无论哪个壳调用，
 * 都直接使用同事已接好真实搜索建议与路由状态的 SiteTopbar。
 */
export function ShellHeader() {
  return <SiteTopbar />;
}
