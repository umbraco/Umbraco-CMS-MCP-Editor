/**
 * Integration tests for the search-content tool.
 *
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initContentTestState,
} from "./setup.js";
import searchContentTool from "../get/search-content.js";

const TEST_SEARCH_QUERY = "home";
const TEST_SEARCH_NONSENSE = "xyznonexistent99999";

describe("search-content", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initContentTestState(extra);
  }, 60000);

  it("should search for content and return results", async () => {
    const result = await searchContentTool.handler(
      { query: TEST_SEARCH_QUERY },
      extra,
    );

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);

  it("should return empty results for nonsense query", async () => {
    const result = await searchContentTool.handler(
      { query: TEST_SEARCH_NONSENSE },
      extra,
    );

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
