/**
 * report-media-missing-alt integration test
 *
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import reportMediaMissingAltTool from "../get/report-media-missing-alt.js";

describe("report-media-missing-alt", () => {
  setupTestEnvironment();

  it("should scan media root and return alt text status", async () => {
    const extra = createMockRequestHandlerExtra();

    const result = await reportMediaMissingAltTool.handler(
      { parentId: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.totalImages).toBe("number");
    expect(typeof data.missingAltCount).toBe("number");
    if (data.items.length > 0) {
      expect(typeof data.items[0].id).toBe("string");
      expect(typeof data.items[0].name).toBe("string");
      expect(typeof data.items[0].hasAlt).toBe("boolean");
    }
  }, 60000);
});
