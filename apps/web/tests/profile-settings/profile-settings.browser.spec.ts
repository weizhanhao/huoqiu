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
const port = 3416;
const baseUrl = `http://${host}:${port}/users/user_demo_0001`;
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

const openSettingsFromProfile = async () =>
  page.getByTestId("profile-page").getByRole("link", { name: "设置" }).click();

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
  throw new Error("Profile and settings interaction harness did not start");
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

describe("profile and settings in a real Chrome DOM", () => {
  it("edits and trims the session profile through the visible form", async () => {
    const profile = page.getByTestId("profile-page");
    await profile.getByRole("button", { name: "编辑资料" }).click();
    await profile
      .getByRole("textbox", { name: "显示名" })
      .fill("  火球研究员  ");
    await profile
      .getByRole("textbox", { name: "个人简介" })
      .fill("  只记录可验证的合成信息。  ");
    await profile.getByRole("button", { name: "保存资料" }).click();

    expect(await profile.getByRole("heading", { level: 2 }).textContent()).toBe(
      "火球研究员",
    );
    expect(
      await profile.getByText("只记录可验证的合成信息。").isVisible(),
    ).toBe(true);
    expect(await profile.getByText(/资料已更新/).isVisible()).toBe(true);
    expect(browserErrors).toEqual([]);
  });

  it("preserves profile edits and social-stat visibility across client routes, then resets on refresh", async () => {
    const profile = page.getByTestId("profile-page");
    await profile.getByRole("button", { name: "编辑资料" }).click();
    await profile.getByRole("textbox", { name: "显示名" }).fill("会话研究员");
    await profile.getByRole("button", { name: "保存资料" }).click();
    await profile.getByRole("link", { name: "设置" }).click();

    const settings = page.getByTestId("settings-page");
    expect(page.url()).toBe(`http://${host}:${port}/settings`);
    expect(await settings.getByText("会话研究员").isVisible()).toBe(true);
    const statsSwitch = settings.getByRole("switch", {
      name: "显示关注与粉丝统计",
    });
    expect(await statsSwitch.getAttribute("aria-checked")).toBe("true");
    await statsSwitch.click();
    expect(await statsSwitch.getAttribute("aria-checked")).toBe("false");

    await settings.getByRole("link", { name: "返回用户主页" }).click();
    expect(
      await page.getByRole("heading", { name: "会话研究员" }).isVisible(),
    ).toBe(true);
    expect(await page.getByText("186 粉丝").count()).toBe(0);

    await page.reload();
    expect(
      await page.getByRole("heading", { name: "火球演示用户" }).isVisible(),
    ).toBe(true);
    expect(await page.getByText("186 粉丝").isVisible()).toBe(true);
    expect(browserErrors).toEqual([]);
  });

  it("validates, focuses, cancels, and resets the inline profile form", async () => {
    const profile = page.getByTestId("profile-page");
    await profile.getByRole("button", { name: "编辑资料" }).click();
    const displayName = profile.getByRole("textbox", { name: "显示名" });
    expect(
      await displayName.evaluate(
        (element) => element === document.activeElement,
      ),
    ).toBe(true);
    await displayName.fill("火");
    await profile.getByRole("button", { name: "保存资料" }).click();
    expect(
      await profile
        .getByRole("alert")
        .getByText("显示名需要 2–20 个字符。")
        .isVisible(),
    ).toBe(true);
    expect(
      await displayName.evaluate(
        (element) => element === document.activeElement,
      ),
    ).toBe(true);
    expect(
      await profile.getByRole("heading", { name: "火球演示用户" }).isVisible(),
    ).toBe(true);

    await displayName.fill("不会保存的名字");
    await profile.getByRole("button", { name: "取消" }).click();
    expect(
      await profile.getByRole("form", { name: "编辑个人资料" }).count(),
    ).toBe(0);
    expect(
      await profile.getByRole("heading", { name: "火球演示用户" }).isVisible(),
    ).toBe(true);

    await profile.getByRole("button", { name: "编辑资料" }).click();
    await profile.getByRole("textbox", { name: "显示名" }).fill("临时资料名");
    await profile.getByRole("button", { name: "保存资料" }).click();
    await profile.getByRole("button", { name: "恢复固定资料" }).click();
    expect(
      await profile.getByRole("heading", { name: "火球演示用户" }).isVisible(),
    ).toBe(true);
    expect(await profile.getByText("已恢复固定演示资料。").isVisible()).toBe(
      true,
    );
  });

  it("supports Arrow, Home, and End keys in the profile tab interface", async () => {
    const profile = page.getByTestId("profile-page");
    for (const tab of await profile.getByRole("tab").all()) {
      const controlledPanel = await tab.getAttribute("aria-controls");
      expect(controlledPanel).not.toBeNull();
      expect(await profile.locator(`#${controlledPanel}`).count()).toBe(1);
    }
    const activity = profile.getByRole("tab", { name: "动态" });
    await activity.focus();
    await activity.press("ArrowRight");
    expect(
      await profile
        .getByRole("tab", { name: "收藏" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(await profile.getByText("合成成长样本 SYN-A").isVisible()).toBe(
      true,
    );

    await profile.getByRole("tab", { name: "收藏" }).press("End");
    expect(
      await profile
        .getByRole("tab", { name: "关注" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(await profile.getByText("北岸观察员").isVisible()).toBe(true);

    await profile.getByRole("tab", { name: "关注" }).press("Home");
    expect(await activity.getAttribute("aria-selected")).toBe("true");
    expect(await profile.getByText("本周公开数据观察清单").isVisible()).toBe(
      true,
    );
  });

  it("applies the reduced-motion setting to the shared session boundary", async () => {
    await openSettingsFromProfile();
    const reducedMotionSwitch = page.getByRole("switch", {
      name: "减少界面动效",
    });
    expect(await reducedMotionSwitch.getAttribute("aria-checked")).toBe(
      "false",
    );
    await reducedMotionSwitch.click();
    expect(await reducedMotionSwitch.getAttribute("aria-checked")).toBe("true");
    expect(
      await page
        .locator("[data-reduced-motion]")
        .first()
        .getAttribute("data-reduced-motion"),
    ).toBe("true");
  });

  it("keeps the settings kicker clear of its heading", async () => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await openSettingsFromProfile();
    const kickerBox = await page
      .getByText("SESSION PREFERENCES / SYNTHETIC ACCOUNT")
      .boundingBox();
    const headingBox = await page
      .getByRole("heading", { name: "设置", level: 2 })
      .boundingBox();

    expect(kickerBox).not.toBeNull();
    expect(headingBox).not.toBeNull();
    if (kickerBox === null || headingBox === null) {
      throw new Error("Settings hero geometry was not measurable");
    }
    expect(kickerBox.y + kickerBox.height).toBeLessThanOrEqual(headingBox.y);
  });

  it.each([
    { height: 844, width: 390 },
    { height: 900, width: 768 },
    { height: 900, width: 1440 },
  ])(
    "has no profile or settings overflow or serious accessibility issue at $width px",
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
        .include("[data-testid=profile-page]")
        .analyze();
      expect(
        accessibility.violations.filter(
          ({ impact }) => impact === "serious" || impact === "critical",
        ),
      ).toEqual([]);

      await openSettingsFromProfile();
      const settingsGeometry = await page.evaluate(() => ({
        body: document.body.scrollWidth,
        document: document.documentElement.scrollWidth,
        viewport: window.innerWidth,
      }));
      expect(settingsGeometry).toEqual({
        body: width,
        document: width,
        viewport: width,
      });

      const settingsAccessibility = await new AxeBuilder({ page })
        .include("[data-testid=settings-page]")
        .analyze();
      expect(
        settingsAccessibility.violations.filter(
          ({ impact }) => impact === "serious" || impact === "critical",
        ),
      ).toEqual([]);
      expect(browserErrors).toEqual([]);
    },
  );

  it("keeps every mobile profile and settings control at least 44 pixels high", async () => {
    const profileControls = page
      .getByTestId("profile-page")
      .locator("button, a, input, textarea");
    await page.getByRole("button", { name: "编辑资料" }).click();
    const profileHeights = await profileControls.evaluateAll((elements) =>
      elements
        .filter(
          (element) =>
            !element.hasAttribute("disabled") &&
            element.getClientRects().length > 0,
        )
        .map((element) => element.getBoundingClientRect().height),
    );
    expect(profileHeights.length).toBeGreaterThan(0);
    expect(Math.min(...profileHeights)).toBeGreaterThanOrEqual(44);

    await openSettingsFromProfile();
    const settingsHeights = await page
      .getByTestId("settings-page")
      .locator("button, a")
      .evaluateAll((elements) =>
        elements.map((element) => element.getBoundingClientRect().height),
      );
    expect(settingsHeights.length).toBeGreaterThan(0);
    expect(Math.min(...settingsHeights)).toBeGreaterThanOrEqual(44);
  });
});
