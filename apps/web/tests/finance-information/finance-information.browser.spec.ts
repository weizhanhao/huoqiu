import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import AxeBuilder from "@axe-core/playwright";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const host = "127.0.0.1";
const port = 3415;
const baseUrl = `http://${host}:${port}`;
const browserRoot = fileURLToPath(new URL("./browser/", import.meta.url));
const viteBinary = fileURLToPath(
  new URL("../../../../node_modules/.bin/vite", import.meta.url),
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
let browserErrors: string[];
let context: BrowserContext;
let page: Page;
let vite: ChildProcess;

const waitForHarness = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The local interaction harness has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Finance information interaction harness did not start");
};

beforeAll(async () => {
  vite = spawn(
    "/bin/sh",
    [viteBinary, "--host", host, "--port", String(port), "--strictPort"],
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
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      browserErrors.push(`${response.status()} ${response.url()}`);
    }
  });
}, 20_000);

afterAll(async () => {
  await context?.close();
  await browser?.close();
  vite?.kill("SIGTERM");
});

beforeEach(async () => {
  browserErrors = [];
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(`${baseUrl}/news`);
});

describe("finance information in a real Chrome DOM", () => {
  it.each([
    { height: 844, width: 390 },
    { height: 900, width: 768 },
    { height: 1000, width: 1440 },
  ])(
    "keeps all deep-link routes accessible and within $width px",
    async ({ height, width }) => {
      await page.setViewportSize({ height, width });

      for (const pathname of [
        "/news",
        "/7x24",
        "/news/company_syn_starport_orders",
      ]) {
        browserErrors = [];
        await page.goto(`${baseUrl}${pathname}`);

        const geometry = await page.evaluate(() => ({
          body: document.body.scrollWidth,
          document: document.documentElement.scrollWidth,
          viewport: window.innerWidth,
        }));
        expect(geometry).toEqual({
          body: width,
          document: width,
          viewport: width,
        });

        const accessibility = await new AxeBuilder({ page })
          .include('[data-testid^="finance-"]')
          .analyze();
        expect(
          accessibility.violations.filter(
            ({ impact }) => impact === "serious" || impact === "critical",
          ),
        ).toEqual([]);
        expect(browserErrors).toEqual([]);
      }
    },
  );

  it("filters channels and searches only the fixed local registry", async () => {
    const hub = page.getByTestId("finance-information-hub");
    const company = hub.getByRole("button", { name: "公司" });

    await company.click();

    expect(await company.getAttribute("aria-pressed")).toBe("true");
    expect(await hub.getByRole("article").count()).toBe(1);
    expect(
      await hub
        .getByText("星港制造合成订单样本保持韧性", { exact: true })
        .count(),
    ).toBe(1);
    expect(await hub.getByText("午后合成市场热度回升").count()).toBe(0);

    await hub.getByRole("searchbox").fill("不存在的标的");
    expect(await hub.getByText("没有匹配的合成资讯").isVisible()).toBe(true);
    expect(browserErrors).toEqual([]);
  });

  it("renders timeline dates and toggles a session-only bookmark on detail", async () => {
    await page.goto(`${baseUrl}/7x24`);
    const timeline = page.getByTestId("finance-briefing-timeline");
    expect(await timeline.getByLabel("2026-08-08 快讯").count()).toBe(1);
    expect(await timeline.getByLabel("2026-08-07 快讯").count()).toBe(1);

    await page.goto(`${baseUrl}/news/company_syn_starport_orders`);
    const detail = page.getByTestId("finance-information-detail");
    const bookmark = detail.getByRole("button", {
      name: "收藏（仅本次会话）",
    });
    await bookmark.click();

    const bookmarked = detail.getByRole("button", {
      name: "已收藏（仅本次会话）",
    });
    expect(await bookmarked.getAttribute("aria-pressed")).toBe("true");
    expect(
      await detail
        .getByRole("link", { name: /星港制造 SYN002/ })
        .getAttribute("href"),
    ).toBe("/instruments/listing_syn_0002");
    expect(browserErrors).toEqual([]);
  });

  it("keeps every mobile feature control at least 44 pixels high", async () => {
    for (const pathname of [
      "/news",
      "/7x24",
      "/news/company_syn_starport_orders",
    ]) {
      await page.goto(`${baseUrl}${pathname}`);
      const controls = page.locator(
        '[data-testid^="finance-"] button, [data-testid^="finance-"] a, [data-testid^="finance-"] input',
      );
      const sizes = await controls.evaluateAll((elements) =>
        elements.map((element) => {
          const bounds = element.getBoundingClientRect();
          return { height: bounds.height, width: bounds.width };
        }),
      );

      expect(sizes.length).toBeGreaterThan(0);
      expect(
        Math.min(...sizes.map(({ height }) => height)),
      ).toBeGreaterThanOrEqual(44);
      expect(
        Math.min(...sizes.map(({ width }) => width)),
      ).toBeGreaterThanOrEqual(44);
    }
  });
});
