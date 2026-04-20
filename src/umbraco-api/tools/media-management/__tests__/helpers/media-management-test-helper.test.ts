/**
 * Media Management Test Helper Tests
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { MediaManagementTestHelper } from "./media-management-test-helper.js";
import { MediaManagementBuilder } from "./media-management-builder.js";

const TEST_FOLDER_NAME = "_Test MediaMgmtHelper";

describe("MediaManagementTestHelper", () => {
  setupTestEnvironment();

  afterEach(async () => {
    await MediaManagementTestHelper.cleanupByName(TEST_FOLDER_NAME);
  }, 30000);

  it("findMediaByName should return undefined for non-existent name", async () => {
    const found = await MediaManagementTestHelper.findMediaByName("_NonExistent 99999");
    expect(found).toBeUndefined();
  }, 30000);

  it("cleanupByName should handle non-existent media gracefully", async () => {
    await MediaManagementTestHelper.cleanupByName("_NonExistent 99999");
  }, 30000);

  it("cleanup should handle non-existent ID gracefully", async () => {
    await MediaManagementTestHelper.cleanup("00000000-0000-0000-0000-000000000000");
  }, 30000);
});
