import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
} from "./setup.js";
import reportUnpublishedTool from "../get/report-unpublished.js";

describe("report-unpublished", () => {
  setupTestEnvironment();

  it("should return unpublished content items", async () => {
    const extra = createMockRequestHandlerExtra();

    const result = await reportUnpublishedTool.handler(
      { parentId: undefined },
      extra,
    );

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
