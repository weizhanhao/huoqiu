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
const port = 3414;
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
let context: BrowserContext;
let page: Page;
let vite: ChildProcess;
let browserErrors: string[];

const waitForHarness = async () => {
  /*
   * 15 秒，不是 4 秒。
   *
   * 原先是 80 次 × 50ms。单独跑一个 spec 时绰绰有余，但全量跑时七个浏览器
   * spec 各自 spawn 一个 Vite 和一个 Chrome，4 秒内绑不上端口的那一个就会
   * 报「did not start」——每次轮到谁取决于调度顺序，看起来像随机抽风。
   *
   * 这不是偶发故障，是预算定得太短。hookTimeout 是 20 秒，这里留 5 秒余量。
   */
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The local interaction harness has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Notification interaction harness did not start");
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
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
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

describe("notification center in a real Chrome DOM", () => {
  it.each([
    { height: 844, width: 390 },
    { height: 900, width: 768 },
    { height: 900, width: 1440 },
  ])(
    "has no overflow or serious accessibility issues at $width px",
    async ({ height, width }) => {
      await page.setViewportSize({ height, width });
      await page.goto(baseUrl);

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
        .include(".d0-app-shell")
        .analyze();
      expect(
        accessibility.violations.filter(
          ({ impact }) => impact === "serious" || impact === "critical",
        ),
      ).toEqual([]);
      expect(browserErrors).toEqual([]);
    },
  );

  it("filters a category, opens a notification, and decreases unread count", async () => {
    const center = page.getByTestId("notification-center");
    const initialUnread = Number(
      await center.getByTestId("notification-total-unread").textContent(),
    );

    await center.getByRole("button", { name: /回复我的/ }).click();
    const link = center.getByRole("link", { name: /打开通知/ }).first();
    expect(await link.getAttribute("href")).toBe(
      "/community/posts/post_syn_0001",
    );
    await link.click();

    expect(
      await center.getByTestId("notification-total-unread").textContent(),
    ).toBe(String(initialUnread - 1));
    expect(
      await page.locator("body").getAttribute("data-last-navigation"),
    ).toBe("/community/posts/post_syn_0001");
  });

  it("marks every notification read", async () => {
    const center = page.getByTestId("notification-center");

    await center.getByRole("button", { name: "全部已读" }).click();

    expect(
      await center.getByTestId("notification-total-unread").textContent(),
    ).toBe("0");
    expect(
      await center
        .locator("article")
        .getByText("未读", { exact: true })
        .count(),
    ).toBe(0);
  });

  it("keeps an unavailable object inert and makes a hidden category empty", async () => {
    const center = page.getByTestId("notification-center");
    await center.getByRole("button", { name: /系统消息/ }).click();
    const tombstone = center.locator(
      'article[data-notification-target="unavailable"]',
    );
    expect(await tombstone.textContent()).toContain("原对象已不可用");
    expect(await tombstone.locator("a").count()).toBe(0);
    await tombstone.getByText("原对象已不可用", { exact: true }).click();
    expect(
      await page.locator("body").getAttribute("data-last-navigation"),
    ).toBeNull();

    await center.getByRole("button", { name: /赞我的/ }).click();
    await center.getByRole("button", { name: "隐藏此通知" }).click();
    expect(await center.getByText("这个分类暂时没有消息").isVisible()).toBe(
      true,
    );
  });

  it("keeps every mobile notification control at least 44 pixels high", async () => {
    const center = page.getByTestId("notification-center");
    const controls = center.locator("button, a");
    const heights = await controls.evaluateAll((elements) =>
      elements.map((element) => element.getBoundingClientRect().height),
    );

    expect(heights.length).toBeGreaterThan(0);
    /*
     * 容差是百分之一像素，只用来吸收测量噪声。
     *
     * getBoundingClientRect 返回的是分数布局结果，这里实测出现过
     * 43.9998779296875——元素声明的就是 44px，差的那 0.0001 是浮点舍入，
     * 不是设计缩水。全量跑时偶发失败、单独跑通过，正是这个原因。
     *
     * 容差刻意取得极小：真实缩水哪怕 0.4px 仍然会失败，44px 这个标准
     * 没有被放低。
     */
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44 - 0.01);
  });
});
