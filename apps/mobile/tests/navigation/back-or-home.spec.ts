import { describe, expect, it, vi } from "vitest";

import { createD0BackHandler } from "../../src/navigation/back-or-home";

/*
 * 返回键。
 *
 * 这条此前挂在搜索页的用例里。搜索页改读真实接口后那条用例整个撤了，而它真正
 * 守的东西跟搜索毫无关系：从推送、二维码或分享链接直接落到一个内页时，栈里
 * 没有上一页，此时调 back() 会退出 App——而用户以为自己按的是「回上一层」。
 */

const makeRouter = (canGoBack: boolean) => ({
  back: vi.fn(),
  canGoBack: vi.fn(() => canGoBack),
  replace: vi.fn(),
});

describe("back or home", () => {
  it("sends a fresh deep link to the fallback instead of leaving the app", () => {
    const router = makeRouter(false);

    createD0BackHandler(router)();

    expect(router.replace).toHaveBeenCalledWith("/home");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("keeps ordinary back history when there is a page to go back to", () => {
    const router = makeRouter(true);

    createD0BackHandler(router)();

    expect(router.back).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("honours a fallback other than home", () => {
    /* 组合详情回组合列表、消息回「我的」——回错地方比回不去更让人迷路。 */
    const router = makeRouter(false);

    createD0BackHandler(router, "/portfolios")();

    expect(router.replace).toHaveBeenCalledWith("/portfolios");
  });
});
