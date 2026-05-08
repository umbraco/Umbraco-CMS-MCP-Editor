/**
 * Media Test Helper Tests
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { MediaTestHelper } from "./media-test-helper.js";
import { MediaBuilder } from "./media-builder.js";

const TEST_FOLDER_NAME = "_Test MediaHelper";

describe("MediaTestHelper", () => {
  setupTestEnvironment();

  afterEach(async () => {
    await MediaTestHelper.cleanup(TEST_FOLDER_NAME);
  }, 30000);

  it("should create a folder and get a valid ID via builder", async () => {
    const folder = await new MediaBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    // Builder.create() internally uses findMediaByName — if it succeeds, the helper works
    expect(folder.getId()).toBeDefined();
    expect(folder.getId().length).toBeGreaterThan(0);
  }, 30000);

  it("findMediaByName should return undefined for non-existent name", async () => {
    const found = await MediaTestHelper.findMediaByName("_NonExistent 99999");
    expect(found).toBeUndefined();
  }, 30000);

  it("getChildren should return an array", async () => {
    const folder = await new MediaBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    // A newly created empty folder should have no children
    const children = await MediaTestHelper.getChildren(folder.getId());
    expect(children).toBeInstanceOf(Array);
    expect(children.length).toBe(0);
  }, 30000);

  it("cleanup should handle non-existent media gracefully", async () => {
    await MediaTestHelper.cleanup("_NonExistent 99999");
  }, 30000);
});
