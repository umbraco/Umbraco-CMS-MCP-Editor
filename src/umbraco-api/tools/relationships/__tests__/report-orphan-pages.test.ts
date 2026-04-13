import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
} from "./setup.js";
import reportOrphanPagesTool from "../get/report-orphan-pages.js";

describe("report-orphan-pages", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  it("should return items array with scannedPages count", async () => {
    const result = await reportOrphanPagesTool.handler(
      { parentId: undefined },
      extra,
    );

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 60000);
});
