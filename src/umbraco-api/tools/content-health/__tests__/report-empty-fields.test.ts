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
  createSnapshotResult,
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

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
