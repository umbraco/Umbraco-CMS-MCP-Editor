import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
} from "./setup.js";
import reportContentByTypeTool from "../get/report-content-by-type.js";

describe("report-content-by-type", () => {
  setupTestEnvironment();

  it("should return content breakdown by document type", async () => {
    const extra = createMockRequestHandlerExtra();

    const result = await reportContentByTypeTool.handler(
      { parentId: undefined },
      extra,
    );

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
