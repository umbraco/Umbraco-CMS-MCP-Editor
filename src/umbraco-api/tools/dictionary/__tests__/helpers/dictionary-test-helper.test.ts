/**
 * Dictionary Test Helper Tests
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { DictionaryTestHelper } from "./dictionary-test-helper.js";
import { DictionaryBuilder } from "./dictionary-builder.js";

const TEST_NAME = "_Test DictionaryHelper";

describe("DictionaryTestHelper", () => {
  setupTestEnvironment();

  afterEach(async () => {
    await DictionaryTestHelper.cleanup(TEST_NAME);
  }, 30000);

  it("findDictionaryItem should find a created item by name", async () => {
    await new DictionaryBuilder()
      .withName(TEST_NAME)
      .withTranslation("en-US", "Helper test")
      .create();

    const found = await DictionaryTestHelper.findDictionaryItem(TEST_NAME);
    expect(found).toBeDefined();
    expect(found!.name).toBe(TEST_NAME);
  }, 30000);

  it("findDictionaryItem should return undefined for non-existent name", async () => {
    const found = await DictionaryTestHelper.findDictionaryItem("_NonExistent 99999");
    expect(found).toBeUndefined();
  }, 30000);

  it("searchDictionaryItem should find a created item", async () => {
    await new DictionaryBuilder()
      .withName(TEST_NAME)
      .withTranslation("en-US", "Helper test")
      .create();

    const found = await DictionaryTestHelper.searchDictionaryItem(TEST_NAME);
    expect(found).toBeDefined();
    expect(found!.name).toBe(TEST_NAME);
  }, 30000);

  it("listRootItems should return an array", async () => {
    const items = await DictionaryTestHelper.listRootItems();
    expect(items).toBeInstanceOf(Array);
  }, 30000);

  it("cleanup should remove an item permanently", async () => {
    await new DictionaryBuilder()
      .withName(TEST_NAME)
      .withTranslation("en-US", "Helper test")
      .create();

    await DictionaryTestHelper.cleanup(TEST_NAME);

    const found = await DictionaryTestHelper.findDictionaryItem(TEST_NAME);
    expect(found).toBeUndefined();
  }, 30000);

  it("cleanup should handle non-existent item gracefully", async () => {
    await DictionaryTestHelper.cleanup("_NonExistent 99999");
  }, 30000);
});
