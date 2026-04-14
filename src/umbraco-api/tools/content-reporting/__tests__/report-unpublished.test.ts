import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
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

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.scannedPages).toBe("number");
    expect(typeof data.total).toBe("number");
    if (data.items.length > 0) {
      expect(typeof data.items[0].id).toBe("string");
      expect(typeof data.items[0].name).toBe("string");
      expect(typeof data.items[0].state).toBe("string");
      expect(typeof data.items[0].lastModified).toBe("string");
    }
  }, 30000);
});
