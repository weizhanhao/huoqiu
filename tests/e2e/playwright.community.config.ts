import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./playwright/community",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  outputDir: "/tmp/huoqiu-community-playwright",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3313",
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    trace: "retain-on-failure",
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
  webServer: {
    command:
      "../../node_modules/.bin/vite --config community.vite.config.mjs --host 127.0.0.1 --port 3313",
    url: "http://127.0.0.1:3313",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
