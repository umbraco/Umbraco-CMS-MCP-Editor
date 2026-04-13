import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
} from "./setup.js";

import listMediaChildrenTool from "../get/list-media-children.js";

describe("list-media-children", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  it("should return root-level media items", async () => {
    const result = await listMediaChildrenTool.handler(
      { parentId: undefined },
      extra,
    );

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
