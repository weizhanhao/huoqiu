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
const port = 3422;
const baseUrl = `http://${host}:${port}`;
const browserRoot = fileURLToPath(new URL("./browser/", import.meta.url));
const viteBinary = fileURLToPath(
  new URL("../../node_modules/.bin/vite", import.meta.url),
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
let resourceUrls: string[];
let vite: ChildProcess;

const waitForHarness = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/community`);
      if (response.ok) return;
    } catch {
      // The local interaction harness has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Synthetic community interaction harness did not start");
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
  page.on("request", (request) => resourceUrls.push(request.url()));
}, 20_000);

afterAll(async () => {
  await context?.close();
  await browser?.close();
  vite?.kill("SIGTERM");
});

beforeEach(async () => {
  browserErrors = [];
  resourceUrls = [];
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(`${baseUrl}/community`);
});

describe("dense synthetic community in a real Chrome DOM", () => {
  it.each([
    { height: 844, width: 390 },
    { height: 900, width: 768 },
    { height: 1000, width: 1440 },
  ])(
    "has no overflow or serious accessibility issue at $width px",
    async ({ height, width }) => {
      await page.setViewportSize({ height, width });

      for (const pathname of [
        "/",
        "/community",
        "/community/posts/post_syn_0001",
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
          .include(
            '[data-testid^="community"], [data-testid="home-community-stream"]',
          )
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

  it("switches dense channels without mixing in fabricated finance news", async () => {
    const feed = page.getByTestId("community-feed");
    expect(await feed.getByTestId("community-feed-card").count()).toBe(5);

    await feed.getByRole("button", { name: "热门" }).click();
    expect(await feed.getByTestId("community-feed-card").count()).toBe(5);
    expect(await feed.getByText("本地视频封面占位").count()).toBeGreaterThan(0);

    await feed.getByRole("button", { name: "资讯" }).click();
    expect(await feed.getByTestId("community-feed-card").count()).toBe(5);
    expect(
      await feed
        .getByText(/不包含真实财经新闻、行情、公告或宏观数据/)
        .isVisible(),
    ).toBe(true);
    expect(browserErrors).toEqual([]);
  });

  it("renders a long, media-rich home stream with no external resource", async () => {
    resourceUrls = [];
    await page.goto(`${baseUrl}/`);
    const stream = page.getByTestId("home-community-stream");

    expect(await stream.getByTestId("community-feed-card").count()).toBe(8);
    expect(await stream.getByText("本地媒体占位").count()).toBeGreaterThan(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeGreaterThan(844 * 3);
    expect(resourceUrls.every((url) => new URL(url).origin === baseUrl)).toBe(
      true,
    );
    expect(browserErrors).toEqual([]);
  });

  it("adds a session comment and nested reply to the prefilled discussion", async () => {
    await page.goto(`${baseUrl}/community/posts/post_syn_0001`);
    const detail = page.getByTestId("community-post-detail");

    expect(await detail.getByTestId("synthetic-comment").count()).toBe(7);
    expect(await detail.getByTestId("synthetic-reply").count()).toBe(6);

    await detail
      .getByRole("textbox", { name: "添加评论" })
      .fill("这是一条新的合成会话评论。");
    await detail.getByRole("button", { name: "发布评论" }).click();
    expect(await detail.getByTestId("synthetic-comment").count()).toBe(8);

    const firstComment = detail.getByTestId("synthetic-comment").first();
    await firstComment
      .getByRole("textbox", { name: "回复 静观样本" })
      .fill("补充一条新的合成回复。");
    await firstComment.getByRole("button", { name: "回复" }).click();
    expect(await detail.getByTestId("synthetic-reply").count()).toBe(7);
    expect(browserErrors).toEqual([]);
  });

  it("keeps every visible mobile community control at least 44 pixels", async () => {
    for (const pathname of [
      "/",
      "/community",
      "/community/posts/post_syn_0001",
    ]) {
      await page.goto(`${baseUrl}${pathname}`);
      const controls = page.locator(
        '[data-testid^="community"] button, [data-testid^="community"] a, [data-testid^="community"] input, [data-testid^="community"] textarea, [data-testid="home-community-stream"] a',
      );
      const sizes = await controls.evaluateAll((elements) =>
        elements
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => {
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
