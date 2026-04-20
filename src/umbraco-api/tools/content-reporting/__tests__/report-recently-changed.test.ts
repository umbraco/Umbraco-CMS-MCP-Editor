import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import reportRecentlyChangedTool from "../get/report-recently-changed.js";

describe("report-recently-changed", () => {
  setupTestEnvironment();

  it("should return recently changed content items", async () => {
    const extra = createMockRequestHandlerExtra();

    const result = await reportRecentlyChangedTool.handler(
      { daysBack: 3650, parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.items).toBeInstanceOf(Array);
    expect(data.scannedPages).toEqual(expect.any(Number));
    expect(data.period).toEqual(3650);
    expect(data.total).toEqual(expect.any(Number));
  }, 30000);
});
