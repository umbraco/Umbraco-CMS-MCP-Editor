/**
 * Integration tests for the report-deep-pages tool.
 *
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 */

import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import reportDeepPagesTool from "../get/report-deep-pages.js";

describe("report-deep-pages", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  it("should return structure with threshold field", async () => {
    const result = await reportDeepPagesTool.handler(
      { depthThreshold: 4, parentId: undefined },
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
      expect(typeof data.items[0].depth).toBe("number");
      expect(typeof data.items[0].url).toBe("string");
    }
  }, 60000);
});
