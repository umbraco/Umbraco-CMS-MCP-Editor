import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
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

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.scannedPages).toBe("number");
    expect(typeof data.total).toBe("number");
    if (data.items.length > 0) {
      expect(typeof data.items[0].id).toBe("string");
      expect(typeof data.items[0].name).toBe("string");
      expect(typeof data.items[0].inboundReferenceCount).toBe("number");
    }
  }, 60000);
});
