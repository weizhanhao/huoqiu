import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { loadD0Fixture } from "../../fixtures/load-d0-fixture";

const fixture = loadD0Fixture();

test("seed identity -> feed -> search -> detail -> session watchlist", async ({
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

  const instrument = fixture.instruments[0];
  if (instrument === undefined) {
    throw new Error("D0 fixture must contain one instrument");
  }

  await page.goto("/?fixture=d0.v1");
  await expect(page.locator(".d0-sidebar").getByText("演示用户")).toBeVisible();
  await expect(page.getByText("演示数据").first()).toBeVisible();
  await expect(page.getByText("公开市场信息的观察与整理")).toBeVisible();

  await page
    .getByRole("searchbox", { name: "搜索标的" })
    .fill(instrument.symbol);
  await page.getByRole("button", { name: "搜索" }).click();
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${instrument.symbol}`));

  await page
    .locator(".search-results")
    .getByRole("link", { name: new RegExp(instrument.name) })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/instruments/${instrument.listing_id}`),
  );
  await expect(page.getByText("huoqiu-synthetic").first()).toBeVisible();
  await expect(page.getByText("20 个日 K 点", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "加自选" }).click();
  await expect(page.getByRole("button", { name: "取消自选" })).toHaveText(
    "已加自选",
  );
  await page
    .locator(".d0-sidebar")
    .getByRole("link", { name: "自选", exact: true })
    .click();

  const watchlistRows = page.locator(".watchlist-table tbody tr");
  await expect(watchlistRows).toHaveCount(1);
  await expect(watchlistRows).toContainText(instrument.name);

  const accessibility = await new AxeBuilder({ page })
    .include(".d0-app-shell")
    .analyze();
  expect(
    accessibility.violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical",
    ),
  ).toEqual([]);

  await page.reload();
  await expect(page.getByText("暂无自选标的", { exact: false })).toBeVisible();
  expect(businessApiRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});
