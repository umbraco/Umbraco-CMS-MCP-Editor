/**
 * disconnect-block-from-library — mirrors the back office's "Disconnect from
 * Library" block action (Umbraco 19 reusable content). Each scenario transfers
 * a provisioned block to the Library first, then disconnects it.
 */

import { describe, it, expect, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  extractChainedResult,
  createElicitation,
} from "./setup.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import transferTool from "../put/transfer-block-to-library.js";
import disconnectTool from "../put/disconnect-block-from-library.js";
import inspectBlocksTool from "../get/inspect-blocks.js";
import {
  createLibraryBlockFixture,
  LIBRARY_PROPERTY_ALIAS,
  LIBRARY_BLOCK_PROPERTY_ALIAS,
  type LibraryBlockFixture,
} from "./helpers/library-block-fixture.js";

const elicitation = createElicitation();

describe("disconnect-block-from-library", () => {
  setupTestEnvironment();
  const extra = createMockRequestHandlerExtra();
  const fixtures: LibraryBlockFixture[] = [];

  /** A fixture page whose block has already been transferred to the Library. */
  async function transferredFixture(name: string): Promise<LibraryBlockFixture & { elementId: string }> {
    const f = await createLibraryBlockFixture(name);
    fixtures.push(f);
    const result = await callTool(transferTool, {
      id: f.pageId,
      propertyAlias: LIBRARY_PROPERTY_ALIAS,
      contentKey: f.blockKey,
      name: `${name} Element`,
      parentFolderId: undefined,
      publish: undefined,
      culture: undefined,
      segment: undefined,
    }, extra);
    expect(result.isError).toBeFalsy();
    const elementId = (getStructuredContent(result) as any).elementId;
    f.trackElement(elementId);
    return { ...f, elementId };
  }

  async function inspect(pageId: string): Promise<any> {
    const result = await callTool(inspectBlocksTool, { id: pageId, propertyAlias: LIBRARY_PROPERTY_ALIAS }, extra);
    return (getStructuredContent(result) as any).blockProperties[0];
  }

  beforeEach(() => {
    elicitation.reset();
  });

  afterAll(async () => {
    elicitation.cleanup();
    for (const f of fixtures) await f.cleanup();
  }, 60000);

  it("replaces the Library block with a local copy and leaves the Element in the Library", async () => {
    const f = await transferredFixture("_Test disconnect-block-from-library");

    const result = await callTool(disconnectTool, {
      id: f.pageId,
      propertyAlias: LIBRARY_PROPERTY_ALIAS,
      elementId: f.elementId,
      culture: undefined,
      segment: undefined,
    }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.message).toMatch(/Disconnected the block/);
    expect(elicitation.mock.mock.calls).toHaveLength(1);

    // The page has a new local block carrying the Element's content, and no Library block.
    const prop = await inspect(f.pageId);
    expect(prop.libraryBlocks).toBeUndefined();
    expect(prop.blocks).toHaveLength(1);
    expect(prop.blocks[0].contentKey).toBe(data.contentKey);
    expect(prop.blocks[0].contentKey).not.toBe(f.elementId);
    expect(prop.blocks[0].properties.find((p: any) => p.alias === LIBRARY_BLOCK_PROPERTY_ALIAS)?.value).toBe(f.blockValue);

    // The Library Element is not affected.
    const element = await mcpClientManager.callTool("cms", "get-element-by-id", { id: f.elementId });
    expect(element.isError).toBeFalsy();
    expect(extractChainedResult(element).variants[0].state).toBe("Published");
  }, 60000);

  it("leaves the page unchanged when the user declines the confirmation", async () => {
    const f = await transferredFixture("_Test disconnect-block-from-library declined");
    elicitation.rejectAll();

    const result = await callTool(disconnectTool, {
      id: f.pageId,
      propertyAlias: LIBRARY_PROPERTY_ALIAS,
      elementId: f.elementId,
      culture: undefined,
      segment: undefined,
    }, extra);

    expect(result.isError).toBe(true);
    const prop = await inspect(f.pageId);
    expect(prop.libraryBlocks).toHaveLength(1);
    expect(prop.libraryBlocks[0].elementId).toBe(f.elementId);
  }, 60000);

  it("rejects a local block without asking for confirmation", async () => {
    const f = await createLibraryBlockFixture("_Test disconnect-block-from-library local");
    fixtures.push(f);

    const result = await callTool(disconnectTool, {
      id: f.pageId,
      propertyAlias: LIBRARY_PROPERTY_ALIAS,
      elementId: f.blockKey,
      culture: undefined,
      segment: undefined,
    }, extra);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("already a local block");
    expect(elicitation.mock.mock.calls).toHaveLength(0);
  }, 60000);
});
