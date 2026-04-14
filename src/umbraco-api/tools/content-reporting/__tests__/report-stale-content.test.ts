import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
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

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.scannedPages).toBe("number");
    expect(typeof data.threshold).toBe("number");
    expect(typeof data.total).toBe("number");
    if (data.items.length > 0) {
      expect(typeof data.items[0].id).toBe("string");
      expect(typeof data.items[0].name).toBe("string");
      expect(typeof data.items[0].daysSinceUpdate).toBe("number");
    }
  }, 30000);
});
