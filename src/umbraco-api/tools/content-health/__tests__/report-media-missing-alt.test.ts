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
  createSnapshotResult,
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

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 60000);
});
