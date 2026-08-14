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
  new URL("../../../node_modules/.bin/vite", import.meta.url),
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
  context = await browser.newContext({
    viewport: { height: 844, width: 390 },
  });
  page = await context.newPage();
  await page.goto(baseUrl);
}, 20_000);

afterAll(async () => {
  await context?.close();
  await browser?.close();
  vite?.kill("SIGTERM");
});

beforeEach(async () => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(baseUrl);
});

const requiredControl = async (locator: ReturnType<Page["getByTestId"]>) => {
  expect(await locator.count()).toBe(1);
  return locator;
};


/*
 * 这个 harness 此前还挂着行情看板、涨跌榜与虚构标的详情三块样本界面，
 * 相应有七条用例点它们的市场页签、涨跌榜页签与详情页签。
 *
 * 那三块已经从站内删掉了：行情与榜单改成了公开行情接口（由
 * tests/server/market-overview.spec.ts 与 hot-board.spec.ts 覆盖），
 * 标的详情只服务真实代码（由 tests/real-finance/real-instrument-page.spec.ts
 * 覆盖）。点样本数据的那七条用例随之删除——它们验的东西已经不存在。
 *
 * 留下的是自选面板：纯前端交互，没有取数，正适合放在真实浏览器里验。
 */
describe("watchlist controls in a real browser DOM", () => {
  it("keeps the shared demo-data badge at WCAG AA text contrast", async () => {
    const results = await new AxeBuilder({ page })
      .include('[data-testid="watchlist"]')
      .withRules(["color-contrast"])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  it.each([
    { height: 844, width: 390 },
    { height: 900, width: 768 },
    { height: 1000, width: 1440 },
  ])("keeps the panel within $width px", async ({ height, width }) => {
    await page.setViewportSize({ height, width });
    await page.goto(baseUrl);

    const layout = await page.evaluate(() => ({
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));

    /*
     * 横向滚动条是最容易漏掉的一类破版：桌面上看不出来，手机上整页可以
     * 左右拖动，而每一块内容看起来都正常。
     */
    expect(layout).toEqual({ body: width, document: width, viewport: width });
  });

  it("switches groups and keeps the empty state honest", async () => {
    const watchlist = await requiredControl(page.getByTestId("watchlist"));

    // 新建一个分组，切过去应当是空的，且说清楚是这个分组内没有。
    await watchlist.locator("#watchlist-new-group").fill("长期观察");
    // 提交按钮写的是「新建」；「新建分组」是输入框的 placeholder。
    await watchlist.getByRole("button", { name: "新建", exact: true }).click();
    await watchlist.getByRole("button", { name: "长期观察" }).click();

    expect(
      await watchlist.getByText(/「长期观察」分组内暂无标的/).count(),
    ).toBe(1);
  });

  it("gives the move controls a real touch target on mobile", async () => {
    await page.setViewportSize({ height: 844, width: 390 });
    await page.goto(baseUrl);

    const watchlist = await requiredControl(page.getByTestId("watchlist"));
    const move = watchlist.locator(".watchlist-move button").first();
    if ((await move.count()) === 0) return;

    const box = await move.boundingBox();
    /*
     * 上移下移是紧挨着的一对，28px 的目标在手机上点偏一下就是把另一只
     * 股票挪了位置，而且没有撤销。
     */
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  });

  it("has no serious or critical accessibility violations", async () => {
    const results = await new AxeBuilder({ page })
      .include('[data-testid="watchlist"]')
      .analyze();

    const serious = results.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    );
    expect(serious).toEqual([]);
  });
});
