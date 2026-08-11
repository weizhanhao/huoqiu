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
const port = 3427;
const baseUrl = `http://${host}:${port}`;
const browserRoot = fileURLToPath(new URL("./browser/", import.meta.url));
const viteBinary = fileURLToPath(
  new URL("../../node_modules/.bin/vite", import.meta.url),
);
const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

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
      // The short-lived local harness has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Real finance interaction harness did not start");
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
  await page.goto(baseUrl);
});

describe("real finance presentational UI in Chrome", () => {
  it("filters locally and expands each source without another data request", async () => {
    const hub = page.getByTestId("real-finance-hub");

    const gdeltFilter = hub.getByRole("button", { name: "只看 GDELT" });
    await gdeltFilter.click();
    expect(await gdeltFilter.getAttribute("aria-pressed")).toBe("true");
    expect(await hub.locator('[data-record-source="gdelt"]').count()).toBe(12);
    expect(await hub.locator('[data-record-source="sec"]').count()).toBe(0);

    await hub
      .getByRole("combobox", { name: "记录类型" })
      .selectOption("news-link");
    await hub.getByRole("searchbox", { name: "关键词" }).fill("link 14");
    expect(await hub.locator('[data-record-source="gdelt"]').count()).toBe(1);
    expect(await hub.getByText("Global market source link 14").count()).toBe(1);

    await hub.getByRole("searchbox", { name: "关键词" }).fill("");
    await hub.getByRole("button", { name: "展开 GDELT 全部 14 条" }).click();
    expect(await hub.locator('[data-record-source="gdelt"]').count()).toBe(14);
    expect(await hub.getByText("已筛选 14 条真实记录").count()).toBe(1);
    expect(browserErrors).toEqual([]);
  });

  it.each([
    { height: 844, width: 390 },
    { height: 900, width: 768 },
    { height: 1000, width: 1440 },
  ])(
    "keeps every surface accessible and within $width px",
    async ({ height, width }) => {
      await page.setViewportSize({ height, width });

      for (const pathname of [
        "/",
        "/briefing",
        "/detail",
        "/detail?record=gdelt-record-01",
        "/?state=invalid",
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
          .include('[data-testid^="real-finance-"]')
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

  it("keeps every mobile feature control at least 44 pixels", async () => {
    for (const pathname of ["/", "/briefing", "/detail"]) {
      await page.goto(`${baseUrl}${pathname}`);
      const controls = page.locator(
        '[data-testid^="real-finance-"] button, [data-testid^="real-finance-"] a, [data-testid^="real-finance-"] input, [data-testid^="real-finance-"] select',
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
