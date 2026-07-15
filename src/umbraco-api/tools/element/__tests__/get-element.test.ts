/**
 * get-element Integration Tests
 *
 * Tests for the get-element GET tool in the element collection.
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
  createSnapshotResult,
  ElementBuilder,
  ElementTestHelper,
} from "./setup.js";
import getElementTool from "../get/get-element.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

const TEST_ELEMENT_NAME = "_Test Get Element";
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";
const NORMALIZED_UUID = "00000000-0000-0000-0000-000000000000";

/** get-element returns `elementType: { id }` — not one of the SDK's auto-normalized
 * reference fields (documentType/mediaType/parent/document/user) — so normalize it
 * by hand for a stable snapshot across test runs (each run provisions a fresh type). */
function normaliseElementTypeId(result: any, elementTypeId: string) {
  if (result?.structuredContent?.elementType?.id === elementTypeId) {
    result.structuredContent.elementType.id = NORMALIZED_UUID;
  }
  return result;
}

describe("get-element", () => {
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

  it("should return element by ID", async () => {
    const result = await callTool(getElementTool, { id: element.getId() }, extra);

    expect(result.isError).toBeFalsy();
    const snapshot = createSnapshotResult(result, element.getId());
    expect(normaliseElementTypeId(snapshot, element.getElementTypeId())).toMatchSnapshot();
  }, 30000);

  it("should return error for non-existent ID", async () => {
    const result = await callTool(getElementTool, { id: NON_EXISTENT_UUID }, extra);

    expect(result.isError).toBe(true);
  }, 30000);
});
