import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
} from "./setup.js";
import reportTranslationCoverageTool from "../get/report-translation-coverage.js";

describe("report-translation-coverage", () => {
  setupTestEnvironment();

  it("should return translation coverage matrix", async () => {
    const extra = createMockRequestHandlerExtra();

    const result = await reportTranslationCoverageTool.handler(
      { parentId: undefined },
      extra,
    );

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 120000);
});
