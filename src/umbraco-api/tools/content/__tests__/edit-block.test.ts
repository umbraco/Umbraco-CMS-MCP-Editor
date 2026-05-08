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
    settingsFixture = await createBlockListFixture(extra, "_Test edit-block settings fixture", { seedSettings: true });
  }, 120000);

  afterAll(async () => {
    elicitation.cleanup();
    if (settingsFixture) await settingsFixture.cleanup();
  }, 30000);

  it("should edit a block property when blocks exist", async () => {
    const inspectResult = await inspectBlocksTool.handler(
      { id: testPageId, propertyAlias: undefined },
      extra,
    );

    const inspectData = getStructuredContent(inspectResult) as any;
    expect(inspectData?.blockProperties).toBeDefined();

    const blockProp = inspectData.blockProperties.find(
      (bp: any) => bp.blocks?.length > 0,
    );
    if (!blockProp) {
      // Graceful skip — no block properties with blocks on this test page
      return;
    }

    const block = blockProp.blocks.find(
      (b: any) => b.contentKey && b.values?.length > 0,
    );
    if (!block) {
      // Graceful skip — no blocks with values on this test page
      return;
    }

    const firstValue = block.values[0];
    const result = await editBlockTool.handler(
      {
        id: testPageId,
        propertyAlias: blockProp.propertyAlias,
        contentKey: block.contentKey,
        values: [{ alias: firstValue.alias, value: firstValue.value }],
        blockType: undefined,
        culture: undefined,
        segment: undefined,
      },
      extra,
    );

    expect(createSnapshotResult(result, testPageId)).toMatchSnapshot();
  }, 30000);

  it("updates a block's settings when blockType='settings'", async () => {
    if (!settingsFixture || !settingsFixture.seededSettingsKey || !settingsFixture.settings) {
      // Demo donor doesn't expose a settings element type — skip rather than fail.
      return;
    }
    const f = settingsFixture;

    const result = await editBlockTool.handler(
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
    if (!settingsFixture) return; // Re-use fixture to get donor info (propertyAlias, elementTypeId, etc.)
    const f = settingsFixture;

    // Create a fresh page with NO block values
    const state = await initContentTestState(extra);
    const freshPage = await new ContentBuilder()
      .withName("_Test edit-block lifecycle regression")
      .withDocumentType(f.donorDocTypeId)
      .withParent(state.testPageId)
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
});
