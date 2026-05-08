/**
 * Recycle Bin Builder Tests
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { RecycleBinBuilder } from "./recycle-bin-builder.js";
import { RecycleBinTestHelper } from "./recycle-bin-test-helper.js";

const TEST_FOLDER_NAME = "_Test RBBuilder";
const CHILD_FOLDER_NAME = "_Test RBBuilder Child";

describe("RecycleBinBuilder", () => {
  setupTestEnvironment();

  afterEach(async () => {
    await RecycleBinTestHelper.cleanupByName("media", TEST_FOLDER_NAME);
    // Child is cascaded when parent is permanently deleted; safety cleanup in case of partial failure.
    await RecycleBinTestHelper.cleanupByName("media", CHILD_FOLDER_NAME);
  }, 30000);

  it("should create a media folder and trash it, returning the trashed id", async () => {
    const trashed = await new RecycleBinBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    expect(trashed.getId()).toBeDefined();
    expect(trashed.getId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

    const found = await RecycleBinTestHelper.findInBin("media", TEST_FOLDER_NAME);
    expect(found).toBeDefined();
    expect(found?.id).toBe(trashed.getId());
  }, 60000);

  it("should create a trashed folder with a nested child (cascade fixture)", async () => {
    const trashed = await new RecycleBinBuilder()
      .withName(TEST_FOLDER_NAME)
      .withNestedChild(CHILD_FOLDER_NAME)
      .create();

    expect(trashed.getId()).toBeDefined();
    expect(trashed.getChildId()).toBeDefined();

    const found = await RecycleBinTestHelper.findInBin("media", TEST_FOLDER_NAME);
    expect(found).toBeDefined();
    expect(found?.hasChildren).toBe(true);
  }, 90000);

  it("should throw if create called without name", async () => {
    const builder = new RecycleBinBuilder();
    await expect(builder.create()).rejects.toThrow(/must have a name/);
  });

  it("should throw if getId called before create", () => {
    const builder = new RecycleBinBuilder();
    expect(() => builder.getId()).toThrow(/No trashed item has been created yet/);
  });
});
