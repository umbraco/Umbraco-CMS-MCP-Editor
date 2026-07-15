/**
 * edit-element Integration Tests
 *
 * Tests for the edit-element PUT tool in the element collection.
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
import editElementTool from "../put/edit-element.js";
import getElementTool from "../get/get-element.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

const TEST_ELEMENT_NAME = "_Test Edit Element";
const TEST_TITLE_VALUE = "Edited title value";
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

describe("edit-element", () => {
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

  it("should update a property value and have it round-trip via get-element", async () => {
    const propertyAlias = element.getPropertyAlias();

    const result = await callTool(
      editElementTool,
      { id: element.getId(), values: [{ alias: propertyAlias, value: TEST_TITLE_VALUE }] },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.id).toBe(element.getId());
    expect(data.name).toBe(TEST_ELEMENT_NAME);
    expect(data.updatedFields).toEqual([propertyAlias]);
    expect(data.message).toContain("Updated");

    const verify = await callTool(getElementTool, { id: element.getId() }, extra);
    const verifyData = getStructuredContent(verify) as any;
    const titleValue = verifyData.values.find((v: any) => v.alias === propertyAlias);
    expect(titleValue?.value).toBe(TEST_TITLE_VALUE);
  }, 30000);

  it("should return error for a non-existent element", async () => {
    const result = await callTool(
      editElementTool,
      { id: NON_EXISTENT_UUID, values: [{ alias: "title", value: "x" }] },
      extra,
    );

    expect(result.isError).toBe(true);
  }, 30000);
});
