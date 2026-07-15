/**
 * create-element Integration Tests
 *
 * Tests for the create-element POST tool in the element collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  ElementTestHelper,
} from "./setup.js";
import createElementTool from "../post/create-element.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

const TEST_ELEMENT_NAME = "_Test Create Element";
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

describe("create-element", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let elementTypeId: string;
  let lastCreatedId: string | undefined;

  beforeAll(async () => {
    const fixture = await ElementTestHelper.createElementType("_Test Create Element Type");
    elementTypeId = fixture.id;
  }, 60000);

  afterAll(async () => {
    await ElementTestHelper.cleanupElementType(elementTypeId);
  }, 30000);

  afterEach(async () => {
    if (lastCreatedId) {
      await ElementTestHelper.cleanup(lastCreatedId);
      lastCreatedId = undefined;
    }
  }, 30000);

  it("should create a draft element (allowedInLibrary type, no parent needed)", async () => {
    const result = await callTool(
      createElementTool,
      { name: TEST_ELEMENT_NAME, elementTypeId, parentId: undefined, values: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    lastCreatedId = (result.structuredContent as any)?.id;
    expect(lastCreatedId).toBeTruthy();

    expect(createSnapshotResult(result, lastCreatedId)).toMatchSnapshot();
  }, 30000);

  it("should return error for a non-existent element type", async () => {
    const result = await callTool(
      createElementTool,
      { name: TEST_ELEMENT_NAME, elementTypeId: NON_EXISTENT_UUID, parentId: undefined, values: undefined },
      extra,
    );

    expect(result.isError).toBe(true);
  }, 30000);
});
