import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
} from "./setup.js";
import reportStaleContentTool from "../get/report-stale-content.js";

describe("report-stale-content", () => {
  setupTestEnvironment();

  it("should return stale content items", async () => {
    const extra = createMockRequestHandlerExtra();

    const result = await reportStaleContentTool.handler(
      { daysSinceUpdate: 1, parentId: undefined },
      extra,
    );

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
