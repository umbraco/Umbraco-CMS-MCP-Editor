/**
 * audit-page-content integration test
 *
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initContentHealthTestState,
} from "./setup.js";
import auditPageContentTool from "../get/audit-page-content.js";

describe("audit-page-content", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initContentHealthTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  it("should audit content body and meta for a known page", async () => {
    const result = await auditPageContentTool.handler(
      { id: testPageId },
      extra,
    );

    expect(createSnapshotResult(result, testPageId)).toMatchSnapshot();
  }, 30000);
});
