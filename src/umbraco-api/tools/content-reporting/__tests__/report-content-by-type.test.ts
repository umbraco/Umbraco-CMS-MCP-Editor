import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
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

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.totalPages).toBe("number");
    expect(typeof data.totalTypes).toBe("number");
    if (data.items.length > 0) {
      expect(typeof data.items[0].documentType).toBe("string");
      expect(typeof data.items[0].alias).toBe("string");
      expect(typeof data.items[0].count).toBe("number");
      expect(Array.isArray(data.items[0].pages)).toBe(true);
    }
  }, 30000);
});
