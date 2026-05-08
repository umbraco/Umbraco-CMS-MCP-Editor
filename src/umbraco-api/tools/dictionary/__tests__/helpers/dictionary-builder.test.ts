/**
 * Dictionary Builder & Helper Tests
 *
 * Verifies the DictionaryBuilder and DictionaryTestHelper work correctly
 * via chained CMS tools against a real Umbraco instance.
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { DictionaryBuilder } from "./dictionary-builder.js";
import { DictionaryTestHelper } from "./dictionary-test-helper.js";

const TEST_DICTIONARY_NAME = "_Test DictionaryBuilder";

describe("DictionaryBuilder", () => {
  setupTestEnvironment();

  afterEach(async () => {
    await DictionaryTestHelper.cleanup(TEST_DICTIONARY_NAME);
  }, 30000);

  it("should create a dictionary item and return an ID", async () => {
    const item = await new DictionaryBuilder()
      .withName(TEST_DICTIONARY_NAME)
      .withTranslation("en-US", "Builder test value")
      .create();

    expect(item.getId()).toBeDefined();
    expect(item.getId().length).toBeGreaterThan(0);
  }, 30000);

  it("should find a created dictionary item by name", async () => {
    await new DictionaryBuilder()
      .withName(TEST_DICTIONARY_NAME)
      .withTranslation("en-US", "Builder test value")
      .create();

    const found = await DictionaryTestHelper.findDictionaryItem(TEST_DICTIONARY_NAME);
    expect(found).toBeDefined();
    expect(found!.name).toBe(TEST_DICTIONARY_NAME);
  }, 30000);

  it("should search for a created dictionary item", async () => {
    await new DictionaryBuilder()
      .withName(TEST_DICTIONARY_NAME)
      .withTranslation("en-US", "Builder test value")
      .create();

    const found = await DictionaryTestHelper.searchDictionaryItem(TEST_DICTIONARY_NAME);
    expect(found).toBeDefined();
    expect(found!.name).toBe(TEST_DICTIONARY_NAME);
  }, 30000);

  it("should delete a created dictionary item", async () => {
    const item = await new DictionaryBuilder()
      .withName(TEST_DICTIONARY_NAME)
      .withTranslation("en-US", "Builder test value")
      .create();

    await item.delete();

    const found = await DictionaryTestHelper.findDictionaryItem(TEST_DICTIONARY_NAME);
    expect(found).toBeUndefined();
  }, 30000);

  it("should throw if create called without name", async () => {
    const builder = new DictionaryBuilder().withTranslation("en-US", "test");
    await expect(builder.create()).rejects.toThrow(/must have a name/);
  });

  it("should throw if getId called before create", () => {
    const builder = new DictionaryBuilder();
    expect(() => builder.getId()).toThrow(/No dictionary item has been created yet/);
  });

  it("cleanup should handle non-existent item gracefully", async () => {
    await DictionaryTestHelper.cleanup("_NonExistent Dictionary 99999");
  }, 30000);

  it("listRootItems should return an array", async () => {
    const items = await DictionaryTestHelper.listRootItems();
    expect(items).toBeInstanceOf(Array);
  }, 30000);
});
