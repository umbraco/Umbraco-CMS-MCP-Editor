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
import editBlockTool from "../put/edit-block.js";
import {
  createLibraryBlockFixture,
  createLibraryElement,
  createMultilingualLibraryBlockFixture,
  createVariantLibraryElement,
  LIBRARY_PROPERTY_ALIAS,
  LIBRARY_BLOCK_PROPERTY_ALIAS,
  type LibraryBlockFixture,
  type MultilingualLibraryBlockFixture,
} from "./helpers/library-block-fixture.js";

const ELEMENT_NAME = "_Test Add Library Block Element";
const elicitation = createElicitation();

const baseArgs = {
  position: undefined,
  columnSpan: undefined,
  rowSpan: undefined,
  areaKey: undefined,
  parentContentKey: undefined,
  settingsValues: undefined,
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

  describe("settings stay local to each placement", () => {
    let settingsElementId: string;
    let placementLayoutKey: string;

    async function settingsValueOf(elementIdOrKey: string): Promise<unknown> {
      const doc = extractChainedResult(await mcpClientManager.callTool("cms", "get-document-by-id", { id: f.pageId }));
      const value = doc.values.find((v: any) => v.alias === LIBRARY_PROPERTY_ALIAS).value;
      const entry = value.layout["Umbraco.BlockList"].find((e: any) => e.contentKey === elementIdOrKey || e.key === elementIdOrKey);
      const settings = value.settingsData.find((s: any) => s.key === entry.settingsKey);
      return settings?.values.find((v: any) => v.alias === LIBRARY_BLOCK_PROPERTY_ALIAS)?.value;
    }

    it("sets the placement's settings with settingsValues", async () => {
      settingsElementId = await createLibraryElement("_Test Add Library Block Settings Element", "Shared content");
      f.trackElement(settingsElementId);

      const result = await callTool(addLibraryBlockTool, {
        ...baseArgs,
        id: f.pageId,
        propertyAlias: LIBRARY_PROPERTY_ALIAS,
        elementId: settingsElementId,
        settingsValues: [{ alias: LIBRARY_BLOCK_PROPERTY_ALIAS, value: "Placement settings" }],
      }, extra);

      expect(result.isError).toBeFalsy();
      placementLayoutKey = (getStructuredContent(result) as any).layoutKey;
      const prop = await inspect();
      const lib = prop.libraryBlocks.find((b: any) => b.elementId === settingsElementId);
      expect(lib.settingsKey).toBeDefined();
      expect(await settingsValueOf(settingsElementId)).toBe("Placement settings");
    }, 60000);

    it("edits a Library block's settings with edit-block (blockType settings) without touching the Element", async () => {
      const result = await callTool(editBlockTool, {
        id: f.pageId,
        propertyAlias: LIBRARY_PROPERTY_ALIAS,
        contentKey: settingsElementId,
        values: [{ alias: LIBRARY_BLOCK_PROPERTY_ALIAS, value: "Edited placement settings" }],
        blockType: "settings",
        culture: undefined,
        segment: undefined,
      }, extra);

      expect(result.isError).toBeFalsy();
      expect(await settingsValueOf(placementLayoutKey)).toBe("Edited placement settings");
      const element = extractChainedResult(await mcpClientManager.callTool("cms", "get-element-by-id", { id: settingsElementId }));
      expect(element.values.find((v: any) => v.alias === LIBRARY_BLOCK_PROPERTY_ALIAS).value).toBe("Shared content");
    }, 60000);

    it("points edit-block at edit-element when asked to edit a Library block's content", async () => {
      const result = await callTool(editBlockTool, {
        id: f.pageId,
        propertyAlias: LIBRARY_PROPERTY_ALIAS,
        contentKey: settingsElementId,
        values: [{ alias: LIBRARY_BLOCK_PROPERTY_ALIAS, value: "Should not be written" }],
        blockType: undefined,
        culture: undefined,
        segment: undefined,
      }, extra);

      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("edit-element");
    }, 60000);
  });

  describe("multilingual", () => {
    let ml: MultilingualLibraryBlockFixture;

    beforeAll(async () => {
      ml = await createMultilingualLibraryBlockFixture("_Test add-library-block multilingual");
    }, 120000);

    afterAll(async () => {
      if (ml) await ml.cleanup();
    }, 60000);

    it("warns about the page's languages the Element isn't published in", async () => {
      const [def, second] = ml.cultures;
      const { id } = await createVariantLibraryElement("_Test Partly Published Element", [def]);
      ml.trackElement(id);

      const result = await callTool(addLibraryBlockTool, {
        ...baseArgs,
        id: ml.pageId,
        propertyAlias: LIBRARY_PROPERTY_ALIAS,
        elementId: id,
      }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.elementPublished).toBe(false);
      expect(data.unpublishedCultures).toEqual([second]);
      expect(data.message).toContain(`not published in ${second}`);
    }, 60000);

    it("reports no warning when the Element is published in every language of the page", async () => {
      const { id } = await createVariantLibraryElement("_Test Fully Published Element", [...ml.cultures]);
      ml.trackElement(id);

      const result = await callTool(addLibraryBlockTool, {
        ...baseArgs,
        id: ml.pageId,
        propertyAlias: LIBRARY_PROPERTY_ALIAS,
        elementId: id,
      }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.elementPublished).toBe(true);
      expect(data.unpublishedCultures).toBeUndefined();
    }, 60000);
  });

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
