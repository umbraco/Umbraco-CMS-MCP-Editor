/**
 * report-large-media integration test
 *
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 * - At least one media item in the media library
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
} from "./setup.js";
import { initMediaHealthTestState } from "./setup.js";
import reportLargeMediaTool from "../get/report-large-media.js";

describe("report-large-media", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    const state = await initMediaHealthTestState(extra);
    expect(state.hasMedia).toBe(true);
  }, 60000);

  it("should return structure with threshold and items", async () => {
    const result = await reportLargeMediaTool.handler(
      { minSizeKb: 1, parentId: undefined },
      extra,
    );

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 60000);
});
