/**
 * Media Health Builder & Helper Tests
 *
 * Verifies the re-exported MediaBuilder and MediaHealthTestHelper work correctly
 * for creating test media and listing root media items.
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { MediaHealthBuilder } from "./media-health-builder.js";
import { MediaHealthTestHelper } from "./media-health-test-helper.js";
import { MediaTestHelper } from "../../../media/__tests__/helpers/media-test-helper.js";

const TEST_FOLDER_NAME = "_Test MediaHealthBuilder";

describe("MediaHealthBuilder", () => {
  setupTestEnvironment();

  afterEach(async () => {
    await MediaTestHelper.cleanup(TEST_FOLDER_NAME);
  }, 30000);

  it("should create a media folder and return an ID", async () => {
    const folder = await new MediaHealthBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    expect(folder.getId()).toBeDefined();
    expect(folder.getId().length).toBeGreaterThan(0);
  }, 30000);

  it("listRootMedia should return an array with items", async () => {
    const items = await MediaHealthTestHelper.listRootMedia();
    expect(items).toBeInstanceOf(Array);
    expect(items.length).toBeGreaterThan(0);
  }, 30000);

  it("cleanup should work via MediaTestHelper", async () => {
    await new MediaHealthBuilder()
      .withName(TEST_FOLDER_NAME)
      .create();

    await MediaTestHelper.cleanup(TEST_FOLDER_NAME);
    // No throw means cleanup works
  }, 30000);
});
