/**
 * edit-block Integration Tests
 *
 * Tests for the edit-block PUT tool in the content collection.
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
  createSnapshotResult,
  getStructuredContent,
  initContentTestState,
  extractChainedResult,
  ContentTestHelper,
  createElicitation,
} from "./setup.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import editBlockTool from "../put/edit-block.js";
import inspectBlocksTool from "../get/inspect-blocks.js";
import addBlocklistBlockTool from "../post/add-blocklist-block.js";
import { createBlockListFixture, type BlockListFixture } from "./helpers/block-fixture.js";
import { ContentBuilder } from "./helpers/content-builder.js";

describe("edit-block", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;
  let settingsFixture: BlockListFixture | null = null;
  const elicitation = createElicitation();

  beforeEach(() => {
    elicitation.reset();
  });

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testPageId = state.testPageId;
    settingsFixture = await createBlockListFixture(extra, "_Test edit-block settings fixture", { seedSettings: true, seedNested: true });
  }, 120000);

  afterAll(async () => {
    elicitation.cleanup();
    if (settingsFixture) await settingsFixture.cleanup();
  }, 30000);

  it("should edit a block property on a seeded block", async () => {
    // The test creates its own block data via the fixture — never skips.
    expect(settingsFixture).not.toBeNull();
    const f = settingsFixture!;

    const result = await callTool(editBlockTool, {
      id: f.pageId,
      propertyAlias: f.propertyAlias,
      contentKey: f.seededBlockKey,
      values: [{ alias: f.blockPropertyAlias, value: "_edited block value" }],
      blockType: undefined,
      culture: undefined,
      segment: undefined,
    }, extra);

    expect(result.isError).toBeFalsy();
    // Seeded block key is a fixed constant; page id is normalised by the helper.
    expect(createSnapshotResult(result, f.pageId)).toMatchSnapshot();
  }, 60000);

  it("updates a block's settings when blockType='settings'", async () => {
    expect(settingsFixture?.seededSettingsKey).toBeTruthy();
    expect(settingsFixture?.settings).toBeTruthy();
    const f = settingsFixture!;

    const result = await callTool(editBlockTool,
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentKey: f.seededBlockKey,
        values: [{ alias: f.settings!.settingsPropertyAlias, value: "_updated settings value" }],
        blockType: "settings",
        culture: undefined,
        segment: undefined,
      },
      extra,
    );
    expect(result.isError).toBeFalsy();

    // Round-trip: verify the settings entry now holds the new value
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: f.pageId });
    const doc = extractChainedResult(docResult);
    const propValue = (doc.values ?? []).find((v: any) => v.alias === f.propertyAlias)?.value;
    const settingsEntry = (propValue?.settingsData ?? []).find((s: any) => s.key === f.seededSettingsKey);
    const updatedProp = (settingsEntry?.values ?? []).find((p: any) => p.alias === f.settings!.settingsPropertyAlias);
    expect(updatedProp?.value).toBe("_updated settings value");
  }, 60000);

  it("edits a block on a page that started empty (lifecycle regression)", async () => {
    expect(settingsFixture).not.toBeNull();
    const f = settingsFixture!; // Re-use fixture to get donor info (propertyAlias, elementTypeId, etc.)

    // Create a fresh page with NO block values. The settings donor's doc type is
    // provisioned allowed-at-root only, so the page goes at root.
    const freshPage = await new ContentBuilder()
      .withName("_Test edit-block lifecycle regression")
      .withDocumentType(f.donorDocTypeId)
      .create();
    const freshPageId = freshPage.getId();

    try {
      // Seed the first block via add-blocklist-block (the fix from Task 7 makes this work)
      const added = await callTool(addBlocklistBlockTool, {
        id: freshPageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_v1 original" }],
        position: undefined,
        settingsTypeKey: undefined,
        settingsValues: undefined,
        culture: undefined,
        segment: undefined,
      }, extra);
      expect(added.isError).toBeFalsy();
      const contentKey = (getStructuredContent(added) as any).contentKey as string;
      expect(contentKey).toMatch(/^[0-9a-f-]{36}$/i);

      // Edit the block's content property to a new value
      const editResult = await callTool(editBlockTool, {
        id: freshPageId,
        propertyAlias: f.propertyAlias,
        contentKey,
        values: [{ alias: f.blockPropertyAlias, value: "_v2 edited" }],
        blockType: undefined,
        culture: undefined,
        segment: undefined,
      }, extra);
      expect(editResult.isError).toBeFalsy();

      // Verify the updated value is persisted via inspect-blocks round-trip
      const inspectResult = await inspectBlocksTool.handler(
        { id: freshPageId, propertyAlias: f.propertyAlias },
        extra,
      );
      const inspectData = getStructuredContent(inspectResult) as any;
      const block = (inspectData?.blockProperties ?? [])
        .flatMap((bp: any) => bp.blocks ?? [])
        .find((b: any) => b.contentKey === contentKey);
      expect(block).toBeDefined();
      const updatedProp = (block?.properties ?? []).find((p: any) => p.alias === f.blockPropertyAlias);
      expect(updatedProp?.value).toBe("_v2 edited");
    } finally {
      await ContentTestHelper.cleanupById(freshPageId);
    }
  }, 90000);

  it("errors with the available blocks' keys and contentTypeKeys when contentKey is not found", async () => {
    expect(settingsFixture).not.toBeNull();
    const f = settingsFixture!;
    const badContentKey = "99999999-9999-4999-8999-999999999999";

    const result = await callTool(editBlockTool, {
      id: f.pageId,
      propertyAlias: f.propertyAlias,
      contentKey: badContentKey,
      values: [{ alias: f.blockPropertyAlias, value: "_should not apply" }],
      blockType: undefined,
      culture: undefined,
      segment: undefined,
    }, extra);

    expect(result.isError).toBe(true);
    const problem = JSON.parse(result.content[0].text);
    expect(problem.title).toBe("Blocks not found");
    expect(Array.isArray(problem.availableBlocks)).toBe(true);
    const seededEntry = problem.availableBlocks.find((b: any) => b.key === f.seededBlockKey);
    expect(seededEntry).toBeDefined();
    // The enrichment is the point of this test: availableBlocks now carries the
    // block's contentTypeKey alongside its key, so the model can tell blocks of
    // different element types apart without an extra lookup.
    expect(seededEntry.contentTypeKey).toBe(f.elementTypeId);
  }, 60000);

  it("enriches a settings entry's contentTypeKey too, not just content blocks", async () => {
    expect(settingsFixture?.seededSettingsKey).toBeTruthy();
    expect(settingsFixture?.settings).toBeTruthy();
    const f = settingsFixture!;
    const badContentKey = "99999999-9999-4999-8999-999999999999";

    const result = await callTool(editBlockTool, {
      id: f.pageId,
      propertyAlias: f.propertyAlias,
      contentKey: badContentKey,
      values: [{ alias: f.blockPropertyAlias, value: "_should not apply" }],
      blockType: undefined,
      culture: undefined,
      segment: undefined,
    }, extra);

    expect(result.isError).toBe(true);
    const problem = JSON.parse(result.content[0].text as string);
    const settingsEntry = problem.availableBlocks.find((b: any) => b.key === f.seededSettingsKey);
    expect(settingsEntry).toBeDefined();
    expect(settingsEntry.contentTypeKey).toBe(f.settings!.settingsElementTypeId);
    // A settings key isn't valid contentKey input for a content edit — the
    // error should say so.
    expect(problem.note).toMatch(/settings/i);
  }, 60000);

  it("enriches a block nested inside another block's own property value", async () => {
    expect(settingsFixture?.seededNestedBlockKey).toBeTruthy();
    const f = settingsFixture!;
    const badContentKey = "99999999-9999-4999-8999-999999999999";

    const result = await callTool(editBlockTool, {
      id: f.pageId,
      propertyAlias: f.propertyAlias,
      contentKey: badContentKey,
      values: [{ alias: f.blockPropertyAlias, value: "_should not apply" }],
      blockType: undefined,
      culture: undefined,
      segment: undefined,
    }, extra);

    expect(result.isError).toBe(true);
    const problem = JSON.parse(result.content[0].text as string);
    const nestedEntry = problem.availableBlocks.find((b: any) => b.key === f.seededNestedBlockKey);
    expect(nestedEntry).toBeDefined();
    // The nested block reuses the same element type as the outer block.
    expect(nestedEntry.contentTypeKey).toBe(f.elementTypeId);
  }, 60000);

  it("surfaces a per-block property-alias failure as a real error, not a reported success", async () => {
    expect(settingsFixture).not.toBeNull();
    const f = settingsFixture!;

    // An alias that doesn't exist on this block's element type — this is the
    // case the pre-fix bug swallowed as a success.
    const result = await callTool(editBlockTool, {
      id: f.pageId,
      propertyAlias: f.propertyAlias,
      contentKey: f.seededBlockKey,
      values: [{ alias: "_notARealPropertyAliasOnThisElementType", value: "_should not apply" }],
      blockType: undefined,
      culture: undefined,
      segment: undefined,
    }, extra);

    expect(result.isError).toBe(true);
    const text = result.content[0].text as string;
    expect(text).toContain("Block update failed");
  }, 60000);

  it("reports a partial failure — and still saves the valid alias — when only one of several aliases is invalid", async () => {
    // Upstream `update-block-property` reports `success: true` on this result
    // whenever at least one property saved, even if another alias in the same
    // call failed — so a plain `success !== true` check misses this case and
    // reports a full success while silently dropping the invalid alias's value.
    expect(settingsFixture).not.toBeNull();
    const f = settingsFixture!;
    const validValue = "_partial write valid value";

    const result = await callTool(editBlockTool, {
      id: f.pageId,
      propertyAlias: f.propertyAlias,
      contentKey: f.seededBlockKey,
      values: [
        { alias: f.blockPropertyAlias, value: validValue },
        { alias: "_notARealPropertyAliasOnThisElementType", value: "_should not apply" },
      ],
      blockType: undefined,
      culture: undefined,
      segment: undefined,
    }, extra);

    expect(result.isError).toBe(true);
    const text = result.content[0].text as string;
    expect(text).toContain("partially failed");
    expect(text).toContain("1 of 2 field(s) saved");

    const problem = JSON.parse(text);
    expect(problem.savedFields).toEqual([f.blockPropertyAlias]);
    expect(problem.failedFields).toEqual(["_notARealPropertyAliasOnThisElementType"]);
    // A partial write still changed the document — validation/previewUrl are
    // worth returning even on this error path.
    expect(typeof problem.validation?.valid).toBe("boolean");
    expect(problem.previewUrl?.url).toEqual(expect.any(String));

    // The valid alias's value was still persisted, despite the overall error.
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: f.pageId });
    const doc = extractChainedResult(docResult);
    const propValue = (doc.values ?? []).find((v: any) => v.alias === f.propertyAlias)?.value;
    const block = (propValue?.contentData ?? []).find((b: any) => b.key === f.seededBlockKey);
    const updatedProp = (block?.values ?? []).find((p: any) => p.alias === f.blockPropertyAlias);
    expect(updatedProp?.value).toBe(validValue);
  }, 60000);
});
