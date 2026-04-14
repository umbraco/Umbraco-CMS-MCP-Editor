/**
 * Media Health Builder & Helper Tests
 */

import { describe, it, expect } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { MediaHealthBuilder } from "./media-health-builder.js";
import { MediaHealthTestHelper } from "./media-health-test-helper.js";

describe("MediaHealthBuilder", () => {
  setupTestEnvironment();

  it("should be a constructable class (re-exported from media)", () => {
    const builder = new MediaHealthBuilder();
    expect(builder).toBeDefined();
    expect(typeof builder.withName).toBe("function");
  });

  it("listRootMedia should return an array", async () => {
    const items = await MediaHealthTestHelper.listRootMedia();
    expect(items).toBeInstanceOf(Array);
  }, 30000);
});
