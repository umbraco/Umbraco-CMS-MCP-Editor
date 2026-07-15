/**
 * publish-element Integration Tests
 *
 * Tests for the publish-element POST tool in the element collection.
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
  extractChainedResult,
  ElementBuilder,
  ElementTestHelper,
} from "./setup.js";
import publishElementTool from "../post/publish-element.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { mcpClientManager } from "../../../mcp-client.js";

const TEST_ELEMENT_NAME = "_Test Publish Element";
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

async function getVariantState(id: string): Promise<string | undefined> {
  const result = await mcpClientManager.callTool("cms", "get-element-by-id", { id });
  const data = extractChainedResult(result) as any;
  return data?.variants?.[0]?.state;
}

describe("publish-element", () => {
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

  it("should publish a draft element", async () => {
    const result = await callTool(publishElementTool, { id: element.getId() }, extra);

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result, element.getId())).toMatchSnapshot();

    expect(await getVariantState(element.getId())).toBe("Published");
  }, 30000);

  it("should return error for a non-existent element", async () => {
    const result = await callTool(publishElementTool, { id: NON_EXISTENT_UUID }, extra);

    expect(result.isError).toBe(true);
  }, 30000);
});
