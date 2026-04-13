/**
 * Integration tests for the report-deep-pages tool.
 *
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 */

import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
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

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 60000);
});
