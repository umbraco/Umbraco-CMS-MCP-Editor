/**
 * Media Management Builder & Helper Tests
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { MediaManagementBuilder } from "./media-management-builder.js";
import { MediaManagementTestHelper } from "./media-management-test-helper.js";

const TEST_FOLDER_NAME = "_Test MediaMgmtBuilder";

describe("MediaManagementBuilder", () => {
  setupTestEnvironment();

  afterEach(async () => {
    await MediaManagementTestHelper.cleanupByName(TEST_FOLDER_NAME);
  }, 30000);

  it("should create a media folder and return an ID", async () => {
    const folder = await new MediaManagementBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    expect(folder.getId()).toBeDefined();
    expect(folder.getId().length).toBeGreaterThan(0);
  }, 30000);

  it("should return a valid UUID after creation", async () => {
    const folder = await new MediaManagementBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    const id = folder.getId();
    expect(id).toBeDefined();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  }, 30000);

  it("should throw if create called without name", async () => {
    const builder = new MediaManagementBuilder();
    await expect(builder.create()).rejects.toThrow(/must have a name/);
  });

  it("should throw if getId called before create", () => {
    const builder = new MediaManagementBuilder();
    expect(() => builder.getId()).toThrow(/No media item has been created yet/);
  });

  it("cleanup should handle non-existent media gracefully", async () => {
    await MediaManagementTestHelper.cleanupByName("_NonExistent Media 99999");
  }, 30000);
});
