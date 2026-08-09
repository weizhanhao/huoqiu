import { defineConfig, devices } from "@playwright/test";
import { resolve } from "node:path";

const evidenceDirectory = resolve(
  process.cwd(),
  "artifacts/evidence/playwright/d0",
);
const usesExternallyManagedServer =
  process.env.HUOQIU_D0_WEB_SERVER_EXTERNAL === "1";

export default defineConfig({
  testDir: "./playwright",
  testMatch: "d0/**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  outputDir: `${evidenceDirectory}/test-results`,
  reporter: [
    ["list"],
    ["json", { outputFile: `${evidenceDirectory}/report.json` }],
  ],
  use: {
    baseURL: "http://127.0.0.1:3310",
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    screenshot: "on",
    trace: "on",
    // The protected D0 runner is deliberately independent of Playwright's
    // user-cache ffmpeg download. Screenshots and traces remain mandatory.
    video: usesExternallyManagedServer ? "off" : "on",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
      },
    },
  ],
  webServer: usesExternallyManagedServer
    ? undefined
    : {
        command:
          "pnpm --filter @huoqiu/web build && pnpm --filter @huoqiu/web start --hostname 127.0.0.1 --port 3310",
        url: "http://127.0.0.1:3310",
        reuseExistingServer: process.env.CI !== "true",
        timeout: 120_000,
      },
});
