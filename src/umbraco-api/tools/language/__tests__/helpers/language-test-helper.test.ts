/**
 * Language Test Helper Tests
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { LanguageTestHelper } from "./language-test-helper.js";
import { LanguageBuilder } from "./language-builder.js";

const TEST_ISO = "nb-NO";

describe("LanguageTestHelper", () => {
  setupTestEnvironment();

  afterEach(async () => {
    await LanguageTestHelper.cleanup(TEST_ISO);
  }, 30000);

  it("languageExists should return true for a created language", async () => {
    await LanguageTestHelper.cleanup(TEST_ISO);

    await new LanguageBuilder()
      .withIsoCode(TEST_ISO)
      .withName("Norwegian Bokmål")
      .create();

    const exists = await LanguageTestHelper.languageExists(TEST_ISO);
    expect(exists).toBe(true);
  }, 30000);

  it("languageExists should return false after cleanup", async () => {
    await LanguageTestHelper.cleanup(TEST_ISO);

    await new LanguageBuilder()
      .withIsoCode(TEST_ISO)
      .withName("Norwegian Bokmål")
      .create();

    await LanguageTestHelper.cleanup(TEST_ISO);

    const exists = await LanguageTestHelper.languageExists(TEST_ISO);
    expect(exists).toBe(false);
  }, 30000);

  it("cleanup should handle non-existent language gracefully", async () => {
    await LanguageTestHelper.cleanup("xx-NONEXISTENT");
  }, 30000);
});
