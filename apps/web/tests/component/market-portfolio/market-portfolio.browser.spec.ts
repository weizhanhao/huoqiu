import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const host = "127.0.0.1";
const port = 3413;
const baseUrl = `http://${host}:${port}`;
const browserRoot = fileURLToPath(new URL("./browser/", import.meta.url));
const viteBinary = fileURLToPath(
  new URL("../../../../../node_modules/.bin/vite", import.meta.url),
);
const chromeCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter((candidate): candidate is string => candidate !== undefined);

let browser: Browser;
let context: BrowserContext;
let page: Page;
let vite: ChildProcess;

const waitForHarness = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The server has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Browser interaction harness did not start");
};

beforeAll(async () => {
  vite = spawn(
    viteBinary,
    ["--host", host, "--port", String(port), "--strictPort"],
    { cwd: browserRoot, stdio: "ignore" },
  );
  await waitForHarness();

  const executablePath = chromeCandidates.find(existsSync);
  browser = await chromium.launch(
    executablePath === undefined
      ? { headless: true }
      : { executablePath, headless: true },
  );
  context = await browser.newContext({ viewport: { height: 844, width: 390 } });
  page = await context.newPage();
  await page.goto(baseUrl);
}, 20_000);

afterAll(async () => {
  await context?.close();
  await browser?.close();
  vite?.kill("SIGTERM");
});

beforeEach(async () => {
  await page.reload();
});

const requiredControl = async (locator: ReturnType<Page["getByTestId"]>) => {
  expect(await locator.count()).toBe(1);
  return locator;
};

describe("market and portfolio controls in a real browser DOM", () => {
  it("clicks market and direction controls and updates visible results", async () => {
    const scope = await requiredControl(page.getByTestId("market-dashboard"));
    const market = scope.getByRole("button", { name: "港股" });
    const ranking = scope.getByRole("button", { name: "跌幅榜" });

    await market.click();
    await ranking.click();

    expect(await market.getAttribute("aria-pressed")).toBe("true");
    expect(await ranking.getAttribute("aria-pressed")).toBe("true");
    expect(await scope.getByText("恒生合成指数").count()).toBe(1);
    expect(await scope.getByText("全球航运", { exact: true }).count()).toBe(1);
    const positiveConcept = scope.getByText("+3.10%", { exact: true });
    const negativeConcept = scope.getByText("-2.80%", { exact: true });
    expect(await positiveConcept.count()).toBe(1);
    expect(await negativeConcept.count()).toBe(1);
    const expectedColors = await page.evaluate(() => {
      const probe = document.createElement("span");
      document.body.append(probe);
      probe.style.color = "var(--hq-market-up-text)";
      const expectedPositive = getComputedStyle(probe).color;
      probe.style.color = "var(--hq-market-down-text)";
      const expectedNegative = getComputedStyle(probe).color;
      probe.remove();
      return { expectedNegative, expectedPositive };
    });
    expect(
      await positiveConcept.evaluate(
        (element) => getComputedStyle(element).color,
      ),
    ).toBe(expectedColors.expectedPositive);
    expect(
      await negativeConcept.evaluate(
        (element) => getComputedStyle(element).color,
      ),
    ).toBe(expectedColors.expectedNegative);
  });

  it("clicks full-ranking filters and removes non-matching listings", async () => {
    const scope = await requiredControl(page.getByTestId("market-rankings"));
    const market = scope.getByRole("button", { name: "美股" });
    const ranking = scope.getByRole("button", { name: "跌幅榜" });

    await market.click();
    await ranking.click();

    expect(await market.getAttribute("aria-pressed")).toBe("true");
    expect(await ranking.getAttribute("aria-pressed")).toBe("true");
    expect(await scope.getByText("北美稳健", { exact: true }).count()).toBe(1);
    expect(await scope.getByText("星港制造", { exact: true }).count()).toBe(0);
  });

  it("clicks add and remove watchlist controls through the shared provider", async () => {
    const market = await requiredControl(page.getByTestId("market-dashboard"));
    const watchlist = await requiredControl(page.getByTestId("watchlist"));
    const row = market.locator("article").filter({ hasText: "星港制造" });
    const add = row.getByRole("button", { name: "加自选" });

    await add.click();

    const added = row.getByRole("button", { name: "取消自选" });
    expect(await added.getAttribute("aria-pressed")).toBe("true");
    expect(await watchlist.getByText("星港制造", { exact: true }).count()).toBe(
      1,
    );
    expect(await watchlist.getByText("42.68", { exact: true }).count()).toBe(1);

    await watchlist.getByRole("button", { name: "取消自选" }).click();

    expect(await watchlist.getByText(/暂无自选标的/).count()).toBe(1);
  });

  it("clicks the annual portfolio period and updates the ranking", async () => {
    const scope = await requiredControl(
      page.getByTestId("portfolio-dashboard"),
    );
    const annual = scope.getByRole("button", { name: "年榜" });

    await annual.click();

    expect(await annual.getAttribute("aria-pressed")).toBe("true");
    expect(await scope.getByText("组合年度榜", { exact: true }).count()).toBe(
      1,
    );
    expect(await scope.getByText("远望全球组合", { exact: true }).count()).toBe(
      1,
    );
  });

  it("clicks follow and updates the pressed state and visible label", async () => {
    const scope = await requiredControl(page.getByTestId("portfolio-detail"));
    const follow = scope.getByRole("button", { name: "+ 关注组合" });

    await follow.click();

    const followed = scope.getByRole("button", { name: "已关注组合" });
    expect(await followed.getAttribute("aria-pressed")).toBe("true");
    expect(await scope.getByText("调仓记录", { exact: true }).count()).toBe(1);
  });

  it("clicks instrument periods, detail tabs, and the shared watchlist control", async () => {
    const scope = await requiredControl(page.getByTestId("instrument-detail"));
    const daily = await requiredControl(
      scope.getByRole("button", { name: "日 K" }),
    );

    await daily.click();

    expect(await daily.getAttribute("aria-pressed")).toBe("true");
    expect(
      await scope
        .getByText("日 K 走势：10 个固定合成采样点", {
          exact: true,
        })
        .count(),
    ).toBe(1);

    const news = await requiredControl(
      scope.getByRole("tab", { name: "资讯" }),
    );
    await news.click();

    expect(await news.getAttribute("aria-selected")).toBe("true");
    expect(
      await scope.getByText("合成制造业订单保持韧性", { exact: true }).count(),
    ).toBe(1);

    for (const [tabName, expectedText] of [
      ["成分股", "星港精工"],
      ["公告", "演示文件不可下载"],
      ["相关 ETF", "美股 ETF"],
      ["讨论", "合成观察员"],
    ] as const) {
      const tab = scope.getByRole("tab", { name: tabName });
      await tab.click();
      expect(await tab.getAttribute("aria-selected")).toBe("true");
      expect(await scope.getByText(expectedText, { exact: true }).count()).toBe(
        tabName === "公告" ? 2 : 1,
      );
    }

    const actionBar = scope.getByRole("navigation", {
      name: "标的快捷操作",
    });
    const add = await requiredControl(
      actionBar.getByRole("button", { name: "加自选" }),
    );
    await add.click();

    const remove = actionBar.getByRole("button", { name: "取消自选" });
    expect(await remove.getAttribute("aria-pressed")).toBe("true");
  });

  it("roves instrument tabs with Arrow, Home, and End keys", async () => {
    const scope = await requiredControl(page.getByTestId("instrument-detail"));
    const discussion = scope.getByRole("tab", { name: "讨论" });
    const constituents = scope.getByRole("tab", { name: "成分股" });
    const relatedEtfs = scope.getByRole("tab", { name: "相关 ETF" });

    await discussion.focus();
    await page.keyboard.press("ArrowRight");

    expect(
      await constituents.evaluate(
        (element) => element === document.activeElement,
      ),
    ).toBe(true);
    expect(await constituents.getAttribute("aria-selected")).toBe("true");
    expect(await scope.getByText("星港精工", { exact: true }).count()).toBe(1);

    await page.keyboard.press("End");

    expect(
      await relatedEtfs.evaluate(
        (element) => element === document.activeElement,
      ),
    ).toBe(true);
    expect(await relatedEtfs.getAttribute("aria-selected")).toBe("true");
    expect(await scope.getByText("美股 ETF", { exact: true }).count()).toBe(1);

    await page.keyboard.press("ArrowRight");

    expect(
      await discussion.evaluate(
        (element) => element === document.activeElement,
      ),
    ).toBe(true);
    expect(await discussion.getAttribute("aria-selected")).toBe("true");
    expect(await scope.getByText("合成观察员", { exact: true }).count()).toBe(
      1,
    );

    await page.keyboard.press("ArrowLeft");
    expect(
      await relatedEtfs.evaluate(
        (element) => element === document.activeElement,
      ),
    ).toBe(true);

    await page.keyboard.press("Home");
    expect(
      await discussion.evaluate(
        (element) => element === document.activeElement,
      ),
    ).toBe(true);
    expect(await discussion.getAttribute("tabindex")).toBe("0");
    expect(await relatedEtfs.getAttribute("tabindex")).toBe("-1");
  });

  it("gives the publish-discussion link the project touch target", async () => {
    const scope = await requiredControl(page.getByTestId("instrument-detail"));
    const publish = scope.getByRole("link", {
      exact: true,
      name: "＋ 发讨论",
    });
    const bounds = await publish.boundingBox();
    const minimum = await page.evaluate(() =>
      Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--hq-touch-web-minimum",
        ),
      ),
    );

    expect(bounds).not.toBeNull();
    expect(bounds?.width).toBeGreaterThanOrEqual(minimum);
    expect(bounds?.height).toBeGreaterThanOrEqual(minimum);
  });

  it("keeps instrument detail panels inside a 390px mobile viewport", async () => {
    const scope = await requiredControl(page.getByTestId("instrument-detail"));
    const quotePanel = scope.locator("header").first();
    const bounds = await quotePanel.boundingBox();
    const widths = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));

    expect(bounds).not.toBeNull();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
      widths.viewport,
    );
    expect(widths.body).toBeLessThanOrEqual(widths.viewport);
    expect(widths.document).toBeLessThanOrEqual(widths.viewport);
  });

  it("has no serious or critical accessibility violations in the instrument detail", async () => {
    const scope = await requiredControl(page.getByTestId("instrument-detail"));
    await scope.getByRole("tab", { name: "成分股" }).click();
    const results = await new AxeBuilder({ page })
      .include('[data-testid="instrument-detail"]')
      .analyze();
    const blockingViolations = results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    );

    expect(blockingViolations).toEqual([]);
  });
});
