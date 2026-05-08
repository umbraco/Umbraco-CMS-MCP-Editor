/**
 * Recycle Bin Test Helper Tests
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { RecycleBinTestHelper } from "./recycle-bin-test-helper.js";
import { RecycleBinBuilder } from "./recycle-bin-builder.js";

const TEST_FOLDER_NAME = "_Test RBHelper";

describe("RecycleBinTestHelper", () => {
  setupTestEnvironment();

  afterEach(async () => {
    await RecycleBinTestHelper.cleanupByName("media", TEST_FOLDER_NAME);
  }, 30000);

  it("findInBin should return undefined for a non-existent name", async () => {
    const found = await RecycleBinTestHelper.findInBin("media", "_NonExistent RB 99999");
    expect(found).toBeUndefined();
  }, 30000);

  it("findInBin should locate a freshly trashed item", async () => {
    const trashed = await new RecycleBinBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    const found = await RecycleBinTestHelper.findInBin("media", TEST_FOLDER_NAME);
    expect(found).toBeDefined();
    expect(found?.id).toBe(trashed.getId());
  }, 60000);

  it("cleanupByName should handle non-existent media gracefully", async () => {
    await RecycleBinTestHelper.cleanupByName("media", "_NonExistent RB 99999");
  }, 30000);

  it("cleanupById should handle non-existent ID gracefully", async () => {
    await RecycleBinTestHelper.cleanupById("media", "00000000-0000-0000-0000-000000000000");
  }, 30000);
});
