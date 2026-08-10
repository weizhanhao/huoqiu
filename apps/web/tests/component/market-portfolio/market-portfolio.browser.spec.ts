import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { chromium, type Browser, type Page } from "@playwright/test";
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
  page = await browser.newPage({ viewport: { height: 844, width: 390 } });
  await page.goto(baseUrl);
}, 20_000);

afterAll(async () => {
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
});
