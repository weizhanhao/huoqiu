/*
 * 只声明这个 helper 真正用到的三个方法，不从 expo-router 借类型。
 *
 * 原先写的是 Pick<ImperativeRouter, ...>，而 ImperativeRouter 这个导出只在
 * 某些 SDK 版本里存在——换一档 SDK，这里就编译不过，报的却是「找不到导出」，
 * 和这个文件在做的事毫无关系。结构化类型让它跟 expo-router 的类型改名脱钩。
 */
/*
 * 回落目标只能是这五个页签之一，写死在类型里。
 *
 * 这里一度写着 "/portfolios"——那是改成五页签之前的旧路由，早就不存在了。
 * 走正常路径不会命中（栈里有上一页），但从深链直接落到组合详情再按返回，
 * 会 replace 到一个不存在的地址，屏幕上是 expo-router 的英文报错页，
 * 退不回去也进不来。类型没跟着路由改，编译器也就没能拦住。
 */
type TabHref =
  | "/fund"
  | "/home"
  | "/private-fund"
  | "/profile"
  | "/watchlist";

type D0BackRouter = Readonly<{
  back: () => void;
  canGoBack: () => boolean;
  replace: (href: TabHref) => void;
}>;

export const createD0BackHandler =
  (
    router: D0BackRouter,
    fallback: TabHref = "/home",
  ): (() => void) =>
  () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(fallback);
  };
