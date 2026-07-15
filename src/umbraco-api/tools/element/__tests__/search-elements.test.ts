/**
 * search-elements Integration Tests
 *
 * Tests for the search-elements GET tool in the element collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  ElementBuilder,
  ElementTestHelper,
} from "./setup.js";
import searchElementsTool from "../get/search-elements.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

const TEST_ELEMENT_NAME = "_Test Search Elements Unique Xyzzy";

describe("search-elements", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let element: ElementBuilder;

  beforeAll(async () => {
    element = await new ElementBuilder().withName(TEST_ELEMENT_NAME).create();
  }, 60000);

  afterAll(async () => {
    await ElementTestHelper.cleanup(element.getId());
    await element.cleanupElementType();
  }, 30000);

  it("should find the created element by name", async () => {
    const result = await callTool(searchElementsTool, { query: TEST_ELEMENT_NAME, take: 10, skip: 0 }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(Array.isArray(data.items)).toBe(true);
    const found = data.items.find((item: any) => item.id === element.getId());
    expect(found).toMatchObject({ id: element.getId(), name: TEST_ELEMENT_NAME });
  }, 30000);

  it("should return an empty result for a query that matches nothing", async () => {
    const result = await callTool(
      searchElementsTool,
      { query: "_NoSuchElementNameShouldEverExist_9182736", take: 10, skip: 0 },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.items).toHaveLength(0);
  }, 30000);
});
