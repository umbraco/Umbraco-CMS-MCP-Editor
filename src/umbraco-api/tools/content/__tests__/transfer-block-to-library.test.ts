/**
 * transfer-block-to-library — mirrors the back office's "Transfer to Library"
 * block action (Umbraco 19 reusable content). Every scenario runs on its own
 * provisioned page (library-block-fixture) and cleans up the page and any
 * Library Element it created.
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  extractChainedResult,
} from "./setup.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import transferTool from "../put/transfer-block-to-library.js";
import inspectBlocksTool from "../get/inspect-blocks.js";
import {
  createLibraryBlockFixture,
  LIBRARY_PROPERTY_ALIAS,
  LIBRARY_BLOCK_PROPERTY_ALIAS,
  type LibraryBlockFixture,
} from "./helpers/library-block-fixture.js";
import { createBlockListFixture, type BlockListFixture } from "./helpers/block-fixture.js";

const baseArgs = { parentFolderId: undefined, publish: undefined, culture: undefined, segment: undefined };

async function getElement(id: string): Promise<any> {
  const result = await mcpClientManager.callTool("cms", "get-element-by-id", { id });
  return result.isError ? null : extractChainedResult(result);
}

describe("transfer-block-to-library", () => {
  setupTestEnvironment();
  const extra = createMockRequestHandlerExtra();
  const fixtures: LibraryBlockFixture[] = [];
  let nonLibraryFixture: BlockListFixture | null = null;

  async function fixture(name: string): Promise<LibraryBlockFixture> {
    const f = await createLibraryBlockFixture(name);
    fixtures.push(f);
    return f;
  }

  beforeAll(async () => {
    nonLibraryFixture = await createBlockListFixture(extra, "_Test transfer non-library fixture", { seedSettings: true });
  }, 120000);

  afterAll(async () => {
    for (const f of fixtures) await f.cleanup();
    if (nonLibraryFixture) await nonLibraryFixture.cleanup();
  }, 60000);

  it("creates and publishes a Library Element and links the block to it", async () => {
    const f = await fixture("_Test transfer-block-to-library publish");

    const result = await callTool(transferTool, {
      ...baseArgs,
      id: f.pageId,
      propertyAlias: LIBRARY_PROPERTY_ALIAS,
      contentKey: f.blockKey,
      name: "_Test Shared Promo",
    }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    f.trackElement(data.elementId);
    expect(data.published).toBe(true);
    expect(data.elementName).toBe("_Test Shared Promo");
    expect(data.message).toMatch(/^Transferred to Library/);

    // The Element holds the block's content and is published.
    const element = await getElement(data.elementId);
    expect(element.variants[0].name).toBe("_Test Shared Promo");
    expect(element.variants[0].state).toBe("Published");
    expect(element.values.find((v: any) => v.alias === LIBRARY_BLOCK_PROPERTY_ALIAS)?.value).toBe(f.blockValue);

    // The page now shows a Library block in place of the local block.
    const inspect = getStructuredContent(await callTool(inspectBlocksTool, { id: f.pageId, propertyAlias: LIBRARY_PROPERTY_ALIAS }, extra)) as any;
    const prop = inspect.blockProperties[0];
    expect(prop.blocks).toHaveLength(0);
    expect(prop.libraryBlocks).toHaveLength(1);
    expect(prop.libraryBlocks[0]).toMatchObject({
      elementId: data.elementId,
      elementName: "_Test Shared Promo",
      contentTypeKey: f.elementTypeId,
      state: "Published",
    });
  }, 60000);

  it("leaves the Element as a draft when publish is false", async () => {
    const f = await fixture("_Test transfer-block-to-library draft");

    const result = await callTool(transferTool, {
      ...baseArgs,
      id: f.pageId,
      propertyAlias: LIBRARY_PROPERTY_ALIAS,
      contentKey: f.blockKey,
      name: "_Test Draft Promo",
      publish: false,
    }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    f.trackElement(data.elementId);
    expect(data.published).toBe(false);
    expect(data.message).toMatch(/^Transferred to Library as draft/);
    expect((await getElement(data.elementId)).variants[0].state).toBe("Draft");
  }, 60000);

  it("rejects a block that is already linked to the Library", async () => {
    const f = await fixture("_Test transfer-block-to-library twice");
    const first = getStructuredContent(await callTool(transferTool, {
      ...baseArgs,
      id: f.pageId,
      propertyAlias: LIBRARY_PROPERTY_ALIAS,
      contentKey: f.blockKey,
      name: "_Test Once",
    }, extra)) as any;
    f.trackElement(first.elementId);

    const second = await callTool(transferTool, {
      ...baseArgs,
      id: f.pageId,
      propertyAlias: LIBRARY_PROPERTY_ALIAS,
      contentKey: first.elementId,
      name: "_Test Twice",
    }, extra);

    expect(second.isError).toBe(true);
    expect(JSON.stringify(second.content)).toContain("already linked to Library Element");
  }, 60000);

  it("rejects a block whose element type is not allowed in the Library, without creating an Element", async () => {
    const f = nonLibraryFixture!;
    expect(f).not.toBeNull();

    const result = await callTool(transferTool, {
      ...baseArgs,
      id: f.pageId,
      propertyAlias: f.propertyAlias,
      contentKey: f.seededBlockKey,
      name: "_Test Not Allowed",
    }, extra);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("is not allowed in the Library");

    // The block is untouched.
    const inspect = getStructuredContent(await callTool(inspectBlocksTool, { id: f.pageId, propertyAlias: f.propertyAlias }, extra)) as any;
    expect(inspect.blockProperties[0].blocks.map((b: any) => b.contentKey)).toContain(f.seededBlockKey);
    expect(inspect.blockProperties[0].libraryBlocks).toBeUndefined();
  }, 60000);

  it("errors when the block does not exist", async () => {
    const f = await fixture("_Test transfer-block-to-library missing");

    const result = await callTool(transferTool, {
      ...baseArgs,
      id: f.pageId,
      propertyAlias: LIBRARY_PROPERTY_ALIAS,
      contentKey: "99999999-9999-4999-8999-999999999999",
      name: "_Test Missing",
    }, extra);

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("was not found");
  }, 60000);
});
