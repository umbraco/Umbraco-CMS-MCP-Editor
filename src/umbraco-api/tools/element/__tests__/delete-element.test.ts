/**
 * delete-element Integration Tests
 *
 * Tests for the delete-element DELETE tool in the element collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { describe, it, expect, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  extractChainedResult,
  createElicitation,
  expectElicitationCancel,
  ElementBuilder,
  ElementTestHelper,
} from "./setup.js";
import deleteElementTool from "../delete/delete-element.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { mcpClientManager } from "../../../mcp-client.js";

const TEST_ELEMENT_NAME = "_Test Delete Element";

const elicitation = createElicitation();

async function getVariantState(id: string): Promise<string | undefined> {
  const result = await mcpClientManager.callTool("cms", "get-element-by-id", { id });
  const data = extractChainedResult(result) as any;
  return data?.variants?.[0]?.state;
}

describe("delete-element", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let lastElement: ElementBuilder | undefined;

  afterAll(async () => {
    elicitation.cleanup();
  });

  afterEach(async () => {
    if (lastElement) {
      await ElementTestHelper.cleanup(lastElement.getId());
      await lastElement.cleanupElementType();
      lastElement = undefined;
    }
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should move an element to the recycle bin", async () => {
    const element = await new ElementBuilder().withName(TEST_ELEMENT_NAME).create();
    lastElement = element;

    const result = await callTool(deleteElementTool, { id: element.getId() }, extra);

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result, element.getId())).toMatchSnapshot();

    expect(await getVariantState(element.getId())).toBe("Trashed");
  }, 30000);

  it("should cancel delete when elicitation is rejected", async () => {
    const element = await new ElementBuilder().withName(TEST_ELEMENT_NAME).create();
    lastElement = element;

    elicitation.rejectAll();
    await expectElicitationCancel(() => deleteElementTool.handler({ id: element.getId() }, extra));

    expect(await getVariantState(element.getId())).not.toBe("Trashed");
  }, 30000);
});
