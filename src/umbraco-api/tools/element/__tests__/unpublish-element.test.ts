/**
 * unpublish-element Integration Tests
 *
 * Tests for the unpublish-element POST tool in the element collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  extractChainedResult,
  createElicitation,
  expectElicitationCancel,
  ElementBuilder,
  ElementTestHelper,
} from "./setup.js";
import unpublishElementTool from "../post/unpublish-element.js";
import publishElementTool from "../post/publish-element.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { mcpClientManager } from "../../../mcp-client.js";

const TEST_ELEMENT_NAME = "_Test Unpublish Element";

const elicitation = createElicitation();

async function getVariantState(id: string): Promise<string | undefined> {
  const result = await mcpClientManager.callTool("cms", "get-element-by-id", { id });
  const data = extractChainedResult(result) as any;
  return data?.variants?.[0]?.state;
}

describe("unpublish-element", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let element: ElementBuilder;

  beforeAll(async () => {
    element = await new ElementBuilder().withName(TEST_ELEMENT_NAME).create();
    await callTool(publishElementTool, { id: element.getId() }, extra);
  }, 60000);

  afterAll(async () => {
    await ElementTestHelper.cleanup(element.getId());
    await element.cleanupElementType();
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should unpublish a published element", async () => {
    const result = await callTool(unpublishElementTool, { id: element.getId() }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.id).toBe(element.getId());
    expect(data.name).toBe(TEST_ELEMENT_NAME);
    expect(data.message).toContain("Unpublished");

    expect(await getVariantState(element.getId())).toBe("Draft");
  }, 30000);

  it("should cancel unpublish when elicitation is rejected", async () => {
    // Re-publish since the previous test unpublished it
    await callTool(publishElementTool, { id: element.getId() }, extra);
    elicitation.reset();

    elicitation.rejectAll();
    await expectElicitationCancel(() => unpublishElementTool.handler({ id: element.getId() }, extra));

    expect(await getVariantState(element.getId())).toBe("Published");
  }, 30000);
});
