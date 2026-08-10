import { expect, test } from "@playwright/test";

test("keeps the 768px top bar inside the viewport with its data badge visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/?fixture=d0.v1");

  const geometry = await page.evaluate(() => {
    const topbar = document.querySelector<HTMLElement>(".d0-topbar");
    const badge = document.querySelector<HTMLElement>(
      ".d0-topbar .demo-data-badge",
    );
    if (topbar === null || badge === null) {
      throw new Error("Expected the top bar and synthetic-data badge");
    }

    const badgeBounds = badge.getBoundingClientRect();
    return {
      badgeLeft: badgeBounds.left,
      badgeRight: badgeBounds.right,
      clientWidth: topbar.clientWidth,
      homeAriaCurrent: document
        .querySelector('.channel-tabs a[href="/"]')
        ?.getAttribute("aria-current"),
      scrollWidth: topbar.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect.soft(geometry.scrollWidth).toBe(geometry.clientWidth);
  expect.soft(geometry.badgeLeft).toBeGreaterThanOrEqual(0);
  expect.soft(geometry.badgeRight).toBeLessThanOrEqual(geometry.viewportWidth);
  expect.soft(geometry.homeAriaCurrent).toBe("page");

  await page.evaluate(() => window.scrollTo({ top: 400 }));
  const stickyGeometry = await page.evaluate(() => {
    const topbar = document.querySelector<HTMLElement>(".d0-topbar");
    const sidebar = document.querySelector<HTMLElement>(".d0-sidebar");
    if (topbar === null || sidebar === null) {
      throw new Error("Expected the intermediate header and sidebar");
    }
    return {
      headerBottom: topbar.getBoundingClientRect().bottom,
      sidebarTop: sidebar.getBoundingClientRect().top,
    };
  });
  expect(stickyGeometry.sidebarTop).toBeGreaterThanOrEqual(
    stickyGeometry.headerBottom,
  );
});
