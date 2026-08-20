/**
 * create-and-publish-element Integration Tests
 *
 * Tests for the create-and-publish-element POST tool in the element collection.
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
  extractChainedResult,
  ElementTestHelper,
} from "./setup.js";
import createAndPublishElementTool from "../post/create-and-publish-element.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { mcpClientManager } from "../../../mcp-client.js";

const TEST_ELEMENT_NAME = "_Test Create And Publish Element";
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

async function getVariantState(id: string): Promise<string | undefined> {
  const result = await mcpClientManager.callTool("cms", "get-element-by-id", { id });
  const data = extractChainedResult(result) as any;
  return data?.variants?.[0]?.state;
}

describe("create-and-publish-element", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let elementTypeId: string;
  let propertyAlias: string;
  let lastCreatedId: string | undefined;

  beforeAll(async () => {
    const fixture = await ElementTestHelper.createElementType("_Test Create And Publish Element Type");
    elementTypeId = fixture.id;
    propertyAlias = fixture.propertyAlias;
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

  it("should create and publish an element with a simple value", async () => {
    const result = await callTool(
      createAndPublishElementTool,
      {
        name: TEST_ELEMENT_NAME,
        elementTypeId,
        parentId: undefined,
        values: [{ alias: propertyAlias, value: "Hello world" }],
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    lastCreatedId = (result.structuredContent as any)?.id;
    expect(lastCreatedId).toBeTruthy();

    expect(createSnapshotResult(result, lastCreatedId)).toMatchSnapshot();

    expect(await getVariantState(lastCreatedId!)).toBe("Published");
  }, 30000);

  it("should return error for a non-existent element type", async () => {
    const result = await callTool(
      createAndPublishElementTool,
      {
        name: TEST_ELEMENT_NAME,
        elementTypeId: NON_EXISTENT_UUID,
        parentId: undefined,
        values: undefined,
      },
      extra,
    );

    expect(result.isError).toBe(true);
  }, 30000);
});
