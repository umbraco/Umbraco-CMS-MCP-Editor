/**
 * add-library-block — mirrors the Library view of the back office's
 * "Add block" dialog (Umbraco 19 reusable content): insert an existing Library
 * Element into a page as a linked block. Also covers removing that block again
 * with delete-block, which must leave the Element in the Library.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  extractChainedResult,
  createElicitation,
  NON_EXISTENT_UUID,
} from "./setup.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import addLibraryBlockTool from "../post/add-library-block.js";
import deleteBlockTool from "../delete/delete-block.js";
import inspectBlocksTool from "../get/inspect-blocks.js";
import {
  createLibraryBlockFixture,
  createLibraryElement,
  LIBRARY_PROPERTY_ALIAS,
  type LibraryBlockFixture,
} from "./helpers/library-block-fixture.js";

const ELEMENT_NAME = "_Test Add Library Block Element";
const elicitation = createElicitation();

const baseArgs = {
  position: undefined,
  columnSpan: undefined,
  rowSpan: undefined,
  areaKey: undefined,
  parentContentKey: undefined,
  culture: undefined,
  segment: undefined,
};

describe("add-library-block", () => {
  setupTestEnvironment();
  const extra = createMockRequestHandlerExtra();
  let f: LibraryBlockFixture;
  let elementId: string;

  async function inspect(): Promise<any> {
    const result = await callTool(inspectBlocksTool, { id: f.pageId, propertyAlias: LIBRARY_PROPERTY_ALIAS }, extra);
    return (getStructuredContent(result) as any).blockProperties[0];
  }

  beforeAll(async () => {
    f = await createLibraryBlockFixture("_Test add-library-block");
    elementId = await createLibraryElement(ELEMENT_NAME, "Shared title from the Library");
    f.trackElement(elementId);
  }, 120000);

  beforeEach(() => {
    elicitation.reset();
  });

  afterAll(async () => {
    elicitation.cleanup();
    if (f) await f.cleanup();
  }, 60000);

  it("inserts an existing Library Element as a linked block before the local block", async () => {
    const result = await callTool(addLibraryBlockTool, {
      ...baseArgs,
      id: f.pageId,
      propertyAlias: LIBRARY_PROPERTY_ALIAS,
      elementId,
      position: { mode: "before", anchorContentKey: f.blockKey },
    }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.elementId).toBe(elementId);
    expect(data.elementName).toBe(ELEMENT_NAME);
    expect(data.elementPublished).toBe(true);
    expect(data.message).toMatch(/^Added Library Element/);

    const prop = await inspect();
    expect(prop.blocks.map((b: any) => b.contentKey)).toEqual([f.blockKey]);
    expect(prop.libraryBlocks).toHaveLength(1);
    expect(prop.libraryBlocks[0]).toMatchObject({ elementId, elementName: ELEMENT_NAME, state: "Published" });

    // Placed before the local block in the layout, like the back office's position choice.
    const doc = extractChainedResult(await mcpClientManager.callTool("cms", "get-document-by-id", { id: f.pageId }));
    const layout = doc.values.find((v: any) => v.alias === LIBRARY_PROPERTY_ALIAS).value.layout["Umbraco.BlockList"];
    expect(layout.map((e: any) => e.contentKey)).toEqual([elementId, f.blockKey]);
    expect(layout[0].isExternalContent).toBe(true);
  }, 60000);

  it("removes the Library block with delete-block and keeps the Element in the Library", async () => {
    const result = await callTool(deleteBlockTool, {
      id: f.pageId,
      propertyAlias: LIBRARY_PROPERTY_ALIAS,
      contentKey: elementId,
      culture: undefined,
      segment: undefined,
    }, extra);

    expect(result.isError).toBeFalsy();
    const prop = await inspect();
    expect(prop.libraryBlocks).toBeUndefined();
    expect(prop.blocks.map((b: any) => b.contentKey)).toEqual([f.blockKey]);

    const element = await mcpClientManager.callTool("cms", "get-element-by-id", { id: elementId });
    expect(element.isError).toBeFalsy();
  }, 60000);

  it("errors clearly when the Element does not exist", async () => {
    const result = await callTool(addLibraryBlockTool, {
      ...baseArgs,
      id: f.pageId,
      propertyAlias: LIBRARY_PROPERTY_ALIAS,
      elementId: NON_EXISTENT_UUID,
    }, extra);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("was not found");
  }, 60000);

  it("rejects 'before' without anchorContentKey", async () => {
    const result = await callTool(addLibraryBlockTool, {
      ...baseArgs,
      id: f.pageId,
      propertyAlias: LIBRARY_PROPERTY_ALIAS,
      elementId,
      position: { mode: "before" },
    }, extra);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("anchorContentKey is required");
  }, 60000);
});
