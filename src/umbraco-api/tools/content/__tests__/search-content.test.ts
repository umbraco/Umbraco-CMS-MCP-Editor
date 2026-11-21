/**
 * Integration tests for the search-content tool.
 *
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 * Creates its own page so results don't depend on the demo site's content (which
 * differs between local dev and CI, and between Umbraco majors).
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  initContentTestState,
  ContentBuilder,
  ContentTestHelper,
} from "./setup.js";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { waitFor } from "../../../../testing/wait-for.js";
import searchContentTool from "../get/search-content.js";

const TEST_PAGE_NAME = "_Test Search Content Zebracorn";
const TEST_SEARCH_QUERY = "Zebracorn";
const TEST_SEARCH_NONSENSE = "xyznonexistent99999";

describe("search-content", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let doc: ContentBuilder;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(state.testDocumentTypeId)
      .withParent(state.testPageId)
      .create();
  }, 60000);

  afterAll(async () => {
    if (doc) {
      await ContentTestHelper.cleanupById(doc.getId());
    }
  }, 30000);

  it("should find the created page by name", async () => {
    // Indexing is async since Umbraco 19 — poll until the new page is searchable.
    const match = await waitFor(async () => {
      const result = await callTool(searchContentTool, { query: TEST_SEARCH_QUERY }, extra);
      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as { items: Array<{ id: string; name: string }> };
      return data.items.find((i) => i.id === doc.getId());
    });
    expect(match).toBeDefined();
    expect(match!.name).toBe(TEST_PAGE_NAME);
  }, 30000);

  it("should return empty results for nonsense query", async () => {
    const result = await callTool(searchContentTool, { query: TEST_SEARCH_NONSENSE }, extra);

    expect(createSnapshotResult(result)).toMatchSnapshot();
  }, 30000);
});
