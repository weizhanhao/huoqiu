/*
 * 只声明这个 helper 真正用到的三个方法，不从 expo-router 借类型。
 *
 * 原先写的是 Pick<ImperativeRouter, ...>，而 ImperativeRouter 这个导出只在
 * 某些 SDK 版本里存在——换一档 SDK，这里就编译不过，报的却是「找不到导出」，
 * 和这个文件在做的事毫无关系。结构化类型让它跟 expo-router 的类型改名脱钩。
 */
type D0BackRouter = Readonly<{
  back: () => void;
  canGoBack: () => boolean;
  replace: (href: "/home" | "/portfolios" | "/profile") => void;
}>;

export const createD0BackHandler =
  (
    router: D0BackRouter,
    fallback: "/home" | "/portfolios" | "/profile" = "/home",
  ): (() => void) =>
  () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace(fallback);
  };
