/**
 * report-empty-fields integration test
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
import reportEmptyFieldsTool from "../get/report-empty-fields.js";

describe("report-empty-fields", () => {
  setupTestEnvironment();

  it("should scan root pages and return items with empty fields", async () => {
    const extra = createMockRequestHandlerExtra();

    const result = await reportEmptyFieldsTool.handler(
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
      expect(Array.isArray(data.items[0].emptyFields)).toBe(true);
      expect(typeof data.items[0].emptyFieldCount).toBe("number");
    }
  }, 30000);
});
