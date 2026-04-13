/**
 * Language Builder & Helper Tests
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { LanguageBuilder } from "./language-builder.js";
import { LanguageTestHelper } from "./language-test-helper.js";

const TEST_ISO = "nb-NO";

describe("LanguageBuilder", () => {
  setupTestEnvironment();

  afterEach(async () => {
    await LanguageTestHelper.cleanup(TEST_ISO);
  }, 30000);

  it("should create a language and return the ISO code", async () => {
    // Clean up first in case it exists
    await LanguageTestHelper.cleanup(TEST_ISO);

    const lang = await new LanguageBuilder()
      .withIsoCode(TEST_ISO)
      .withName("Norwegian Bokmål")
      .create();

    expect(lang.getIsoCode()).toBe(TEST_ISO);
  }, 30000);

  it("should verify a created language exists", async () => {
    await LanguageTestHelper.cleanup(TEST_ISO);

    await new LanguageBuilder()
      .withIsoCode(TEST_ISO)
      .withName("Norwegian Bokmål")
      .create();

    const exists = await LanguageTestHelper.languageExists(TEST_ISO);
    expect(exists).toBe(true);
  }, 30000);

  it("languageExists should return a boolean", async () => {
    // Even for non-standard ISO codes, the CMS may return a result
    const exists = await LanguageTestHelper.languageExists(TEST_ISO);
    expect(typeof exists).toBe("boolean");
  }, 30000);

  it("should throw if create called without ISO code", async () => {
    const builder = new LanguageBuilder().withName("Test");
    await expect(builder.create()).rejects.toThrow(/must have an ISO code/);
  });

  it("cleanup should handle non-existent language gracefully", async () => {
    await LanguageTestHelper.cleanup("xx-NONEXISTENT");
  }, 30000);
});
