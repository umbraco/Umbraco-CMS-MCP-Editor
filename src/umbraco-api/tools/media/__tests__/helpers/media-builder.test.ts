/**
 * MediaBuilder Tests
 *
 * Verifies that the MediaBuilder can create and delete media folders
 * against a real Umbraco instance via MCP chaining.
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
} from "@umbraco-cms/mcp-server-sdk/testing";
import { MediaBuilder } from "./media-builder.js";
import { MediaTestHelper } from "./media-test-helper.js";

const TEST_FOLDER_NAME = "_Test MediaBuilder Folder";

describe("MediaBuilder", () => {
  setupTestEnvironment();

  afterEach(async () => {
    await MediaTestHelper.cleanup(TEST_FOLDER_NAME);
  }, 30000);

  it("should create a media folder and return an ID", async () => {
    const builder = await new MediaBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    expect(builder.getId()).toBeDefined();
    expect(builder.getId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  }, 30000);

  it("should expose the created folder ID via getId()", async () => {
    const builder = await new MediaBuilder().withName(TEST_FOLDER_NAME).create();

    const id = builder.getId();
    expect(id).toBeDefined();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    // Verify the item is accessible via the builder's createdItem
    const item = builder.getCreatedItem();
    expect(item.id).toBe(id);
  }, 30000);

  it("should delete a created media folder", async () => {
    const builder = await new MediaBuilder().withName(TEST_FOLDER_NAME).create();
    const id = builder.getId();
    expect(id).toBeDefined();

    await builder.delete();

    const found = await MediaTestHelper.findMediaByName(TEST_FOLDER_NAME);
    expect(found).toBeUndefined();
  }, 30000);
});
