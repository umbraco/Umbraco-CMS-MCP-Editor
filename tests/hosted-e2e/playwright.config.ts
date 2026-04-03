import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 120000,
  retries: 0,
  workers: 1,
  use: {
    ignoreHTTPSErrors: true,
    // Run headed so you can see the browser in VS Code test runner.
    // Set HEADLESS=true or use --headed CLI flag to override.
    headless: process.env.HEADLESS === "true" ? true : false,
    // Slow down actions so you can follow what's happening
    launchOptions: {
      slowMo: process.env.SLOW_MO ? parseInt(process.env.SLOW_MO) : 500,
    },
  },
  projects: [
    {
      name: "e2e",
      testMatch: "**/*.test.ts",
    },
  ],
});
