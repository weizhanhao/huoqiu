import { expect, test } from "@playwright/test";

const routes = [
  {
    path: "/?fixture=d0.v1",
    normal: "公开市场信息的观察与整理",
    empty: "暂无演示内容",
    error: "演示内容暂时无法加载",
  },
  {
    path: "/search?q=SYN001&fixture=d0.v1",
    normal: "搜索演示标的",
    empty: "没有可搜索的演示标的",
    error: "演示搜索暂时不可用",
  },
  {
    path: "/instruments/listing_syn_0001?fixture=d0.v1",
    normal: "20 个日 K 点",
    empty: "暂无演示标的详情",
    error: "演示标的详情暂时不可用",
  },
  {
    path: "/watchlist?fixture=d0.v1",
    normal: "我的自选",
    empty: "暂无演示自选数据",
    error: "演示自选暂时不可用",
  },
] as const;

const withState = (path: string, state: "loading" | "empty" | "error") =>
  `${path}${path.includes("?") ? "&" : "?"}fixture_state=${state}`;

test("all D0 routes expose normal/loading/empty/error and recover", async ({
  page,
}) => {
  const businessApiRequests: string[] = [];
  const browserErrors: string[] = [];

  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/v1")) {
      businessApiRequests.push(`${route.request().method()} ${url.href}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    browserErrors.push(`pageerror: ${error.message}`);
  });

  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.locator("body")).toContainText(route.normal);

    await page.goto(withState(route.path, "loading"));
    await expect(
      page.locator('[role="status"][aria-busy="true"]'),
    ).toBeVisible();

    await page.goto(withState(route.path, "empty"));
    await expect(page.locator("main")).toContainText(route.empty);
    await expect(page.locator('main [role="status"]')).toBeVisible();

    await page.goto(withState(route.path, "error"));
    await expect(page.locator("main")).toContainText(route.error);
    await page
      .locator('main [role="alert"]')
      .getByRole("button", { name: "重试" })
      .click();
    await expect(page).not.toHaveURL(/fixture_state=/u);
    await expect(page.locator("body")).toContainText(route.normal);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of routes) {
    await page.goto(route.path);
    const dimensions = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.innerWidth);
    expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.innerWidth);
  }

  expect(businessApiRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});
