import { SidebarAccount } from "../../features/account/sidebar-account";

/* 兼容旧首页壳：身份始终由真实账号会话组件渲染。 */
export function XueqiuSidebarAccount() {
  return <SidebarAccount fallbackName="未登录" />;
}
