/**
 * Root Playwright config — delegates to the hosted e2e config.
 * This file exists so IDE test runners (VS Code, JetBrains) discover the tests.
 */
export { default } from "./tests/hosted-e2e/playwright.config.js";
