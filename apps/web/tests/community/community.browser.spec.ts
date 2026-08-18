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
        /*
         * 等到网络静默再量。
         *
         * Vite 的 CSS 模块是 JS 执行后才注入 <style> 的，默认的 load 时机
         * 可能落在注入之前——那时量到的是无样式内容的宽度，报出来是
         * 「533 ≠ 390」，看着像视口没设上，其实是样式还没到。
         *
         * 同一个文件里 44px 那条门禁早就因为这个原因改成了 networkidle，
         * 这里当时漏了：满负载跑全量用例时那个窗口被拉长，就会偶发。
         * 偶尔通过的门禁等于没有门禁——它既会假报警，也会在真的溢出时
         * 凑巧放行。
         */
        await page.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle" });
        /*
         * 等 globals.css 真的应用了再量。
         *
         * Vite 里样式是模块求值之后由 JS 插进 <style> 的，networkidle 也可能
         * 落在插入之前——那时量到的是无样式布局：指数条按四列不换行铺开，
         * 在 390px 上是 533，整页看着像溢出。满负载跑全量用例时这个窗口被
         * 拉长，于是「单独跑过、一起跑挂」。
         *
         * 这里等的是一条与被断言内容无关的规则（外壳布局），不是等
         * 「溢出消失」——后者会把真的溢出一并等没了，门禁就永远不会响。
         */
        await page.waitForFunction(() =>
          [...document.styleSheets].some((sheet) => {
            try {
              return [...sheet.cssRules].some((rule) =>
                rule.cssText.includes(".d0-app-shell"),
              );
            } catch {
              /* 跨源样式表读不到规则，跳过即可。 */
              return false;
            }
          }),
        );
        const geometry = await page.evaluate(() => ({
          body: document.body.scrollWidth,
          document: document.documentElement.scrollWidth,
          /*
           * 报出是谁把页面撑宽的。只报数字的话，每次都得从头查一遍。
           *
           * 判据是「自己装不下，又不裁切」——横向滚动容器（频道条那种）
           * 的子元素本来就会伸到视口之外，那是设计如此，按位置去筛会把
           * 它们全部误报成溢出，真正的元凶反而被挤出列表。
           */
          offenders: [...document.querySelectorAll("body *")]
            .filter((element) => {
              if (element.scrollWidth <= element.clientWidth) return false;
              return getComputedStyle(element).overflowX === "visible";
            })
            .slice(0, 5)
            .map(
              (element) =>
                `${element.tagName.toLowerCase()}.${String(element.className || "-").slice(0, 40)}@${String(element.scrollWidth)}`,
            ),
          viewport: window.innerWidth,
        }));
        expect({ ...geometry, pathname }).toEqual({
          body: width,
          document: width,
          offenders: [],
          pathname,
          viewport: width,
        });

        const accessibility = await new AxeBuilder({ page })
          .include(pathname === "/" ? ".d0-main" : '[data-testid^="community"]')
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
    for (const channel of ["关注", "热门", "资讯", "达人", "基金", "ETF"]) {
      await feed.getByRole("button", { name: channel, exact: true }).click();
      expect(await feed.getByTestId("community-feed-card").count()).toBe(5);
    }

    await feed.getByRole("button", { name: "热门", exact: true }).click();
    expect(await feed.getByText("本地视频封面占位").count()).toBeGreaterThan(0);

    await feed.getByRole("button", { name: "资讯", exact: true }).click();
    expect(
      await feed
        .getByText(/不包含真实财经新闻、行情、公告或宏观数据/)
        .isVisible(),
    ).toBe(true);
    expect(browserErrors).toEqual([]);
  });

  it("keeps the teammate home implementation without external resources", async () => {
    resourceUrls = [];
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

    expect(await page.locator(".index-strip").count()).toBe(1);
    expect(await page.locator(".home-index-carousel").count()).toBe(1);
    expect(await page.getByRole("button", { name: "上一组指数" }).count()).toBe(
      1,
    );
    expect(await page.getByRole("button", { name: "下一组指数" }).count()).toBe(
      1,
    );
    expect(await page.getByTestId("follow-stream").count()).toBe(1);
    expect(await page.getByText("关注内容 7", { exact: true }).count()).toBe(1);
    expect(await page.getByRole("link", { name: "消息" }).count()).toBe(1);
    expect(await page.getByRole("button", { name: "账号与设置" }).count()).toBe(
      1,
    );
    expect(await page.getByText("热门话题", { exact: true }).count()).toBe(0);
    expect(resourceUrls.every((url) => new URL(url).origin === baseUrl)).toBe(
      true,
    );
    expect(browserErrors).toEqual([]);
  }, 60_000);

  /*
   * 这条用例原先验证的是「匿名也能评论」。
   *
   * 那条路径本身就是缺陷：会话内评论一律署名「火球演示用户」——真实账号
   * 写下的评论挂着别人的名字，未登录访客发的评论则根本没人认领。现在未登录
   * 会被拒绝并说明原因。
   *
   * 浏览器夹具里没有账号会话，能覆盖的就是未登录这一侧；「发成功且署名正确」
   * 由 community-state.spec.ts 的单测守着。
   */
  it("refuses to post a comment while signed out instead of inventing an author", async () => {
    await page.goto(`${baseUrl}/community/posts/post_syn_0001`);
    const detail = page.getByTestId("community-post-detail");

    expect(await detail.getByTestId("fixed-synthetic-comment").count()).toBe(7);
    expect(await detail.getByTestId("fixed-synthetic-reply").count()).toBe(6);
    expect(await detail.getByTestId("session-local-comment").count()).toBe(0);
    expect(await detail.getByTestId("session-local-reply").count()).toBe(0);
    expect(
      await detail.getByTestId("comment-count-summary").textContent(),
    ).toBe("展示 7 条评论 / 页面基线共 32 条");

    await detail
      .getByRole("textbox", { name: "添加评论" })
      .fill("未登录时不该发得出去。");
    await detail.getByRole("button", { name: "发布评论" }).click();

    // 计数一动不动：不能有一条没人认领的评论悄悄进到列表里。
    expect(await detail.getByTestId("session-local-comment").count()).toBe(0);
    expect(
      await detail.getByTestId("comment-count-summary").textContent(),
    ).toBe("展示 7 条评论 / 页面基线共 32 条");
    // 而且必须说明为什么，不能点了没反应。
    expect(await detail.textContent()).toContain("登录后才能发表评论。");

    const firstComment = detail.getByTestId("fixed-synthetic-comment").first();
    await firstComment
      .getByRole("textbox", { name: "回复 静观样本" })
      .fill("未登录时也不该回复得出去。");
    await firstComment.getByRole("button", { name: "回复" }).click();
    expect(await detail.getByTestId("session-local-reply").count()).toBe(0);
    expect(await detail.textContent()).toContain("登录后才能回复评论。");
    expect(browserErrors).toEqual([]);
  });

  it("keeps every visible mobile community control at least 44 pixels", async () => {
    for (const pathname of [
      "/",
      "/community",
      "/community/posts/post_syn_0001",
    ]) {
      /*
       * 等到网络静默再量。
       *
       * 这里原本 goto 完就直接测量。Vite 的 CSS 模块是 JS 执行后才注入
       * <style> 的，测量窗口一旦落在注入之前，量到的就是浏览器默认样式下的
       * 按钮高度——曾经偶发地报出 42px，重跑又过。
       *
       * 偶尔通过的门禁等于没有门禁：它既会假报警，也会在真的违规时凑巧放行。
       * 这里只是把测量点钉死，44 的阈值一个字没动。
       */
      await page.goto(`${baseUrl}${pathname}`, { waitUntil: "networkidle" });
      const controls = page.locator(
        pathname === "/"
          ? ".d0-main textarea, .d0-main button, .sidebar-publish"
          : '[data-testid^="community"] button, [data-testid^="community"] a, [data-testid^="community"] input, [data-testid^="community"] textarea',
      );
      const sizes = await controls.evaluateAll((elements) =>
        elements
          .filter((element) => element.getClientRects().length > 0)
          .map((element) => {
            const bounds = element.getBoundingClientRect();
            return {
              height: bounds.height,
              /* 报出是谁不够大。只报数字的话，得回头一个个手点才知道改哪。 */
              label: `${element.tagName.toLowerCase()}.${element.className || "-"}: ${(element.textContent ?? "").trim().slice(0, 24)}`,
              width: bounds.width,
            };
          }),
      );

      expect(sizes.length).toBeGreaterThan(0);
      const tooSmall = sizes.filter(
        ({ height, width }) => height < 44 || width < 44,
      );
      expect(tooSmall.map(({ label }) => label)).toEqual([]);
    }

    await page.goto(`${baseUrl}/community/posts/post_syn_0001`);
    const replyInputHeight = await page
      .locator('[id^="reply-"]')
      .first()
      .evaluate((element) => element.getBoundingClientRect().height);
    expect(replyInputHeight).toBeGreaterThanOrEqual(44);
  });
});
