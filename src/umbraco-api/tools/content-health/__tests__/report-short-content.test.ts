/**
 * report-short-content integration test
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
  createSnapshotResult,
} from "./setup.js";
import reportShortContentTool from "../get/report-short-content.js";

describe("report-short-content", () => {
  setupTestEnvironment();

  it("should scan with default threshold", async () => {
    const extra = createMockRequestHandlerExtra();

    const result = await reportShortContentTool.handler(
      { minWordCount: 100, parentId: undefined },
      extra,
    );

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
