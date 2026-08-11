import type { ImperativeRouter } from "expo-router";

type D0BackRouter = Pick<ImperativeRouter, "back" | "canGoBack" | "replace">;

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
