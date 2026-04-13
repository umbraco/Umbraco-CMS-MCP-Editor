import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
} from "./setup.js";

import searchMediaTool from "../get/search-media.js";

describe("search-media", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  it("should search media and return results", async () => {
    const result = await searchMediaTool.handler(
      { query: "image", parentId: undefined },
      extra,
    );

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);

  it("should return empty results for nonsense query", async () => {
    const result = await searchMediaTool.handler(
      { query: "xyznonexistentmedia99999", parentId: undefined },
      extra,
    );

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
