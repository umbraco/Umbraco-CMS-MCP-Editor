/**
 * audit-page-seo integration test
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
  NON_EXISTENT_UUID,
} from "./setup.js";
import auditPageSeoTool from "../get/audit-page-seo.js";

describe("audit-page-seo", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initContentHealthTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  it("should return SEO audit for a known page", async () => {
    const result = await auditPageSeoTool.handler({ id: testPageId }, extra);

    expect(createSnapshotResult(result, testPageId)).toMatchSnapshot();
  }, 30000);

  it("should return error for non-existent page ID", async () => {
    const result = await auditPageSeoTool.handler(
      { id: NON_EXISTENT_UUID },
      extra,
    );

    expect(result.isError).toBe(true);
  }, 30000);
});
