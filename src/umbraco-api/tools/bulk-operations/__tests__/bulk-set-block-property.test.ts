import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createSnapshotResult,
  initBulkOperationsTestState,
  createElicitation,
  expectElicitationCancel,
  FAKE_CONTENT_TYPE_KEY,
} from "./setup.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import bulkSetBlockPropertyTool from "../post/bulk-set-block-property.js";
import inspectBlocksTool from "../../content/get/inspect-blocks.js";
import { createBlockListFixture, type BlockListFixture } from "../../content/__tests__/helpers/block-fixture.js";
import { ContentBuilder, ContentTestHelper, initContentTestState } from "../../content/__tests__/setup.js";
import { SKIPPED_SENTINEL } from "../../helpers/bulk-handler.js";

const elicitation = createElicitation();

describe("bulk-set-block-property", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let firstRootPageId: string;
  let blockFixture: BlockListFixture | null = null;

  beforeAll(async () => {
    const state = await initBulkOperationsTestState(extra);
    firstRootPageId = state.firstRootPageId;
    blockFixture = await createBlockListFixture(extra, "_Test bulk-set-block-property fixture");
  }, 60000);

  afterAll(async () => {
    elicitation.cleanup();
    if (blockFixture) await blockFixture.cleanup();
  });

  beforeEach(() => {
    elicitation.reset();
  });

  it("should return error when more than 10 IDs are provided", async () => {
    const tooManyIds = Array.from(
      { length: 11 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    );

    const result = await bulkSetBlockPropertyTool.handler(
      {
        ids: tooManyIds,
        contentTypeKey: FAKE_CONTENT_TYPE_KEY,
        propertyAlias: "contentRows",
        values: [{ alias: "caption", value: "Test" }],
        culture: undefined,
        segment: undefined,
      },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data.message).toContain("10");
  }, 10000);

  it("should update block properties on pages with matching blocks", async () => {
    // First, inspect the page to find a block with its contentTypeKey
    const inspectResult = await inspectBlocksTool.handler(
      { id: firstRootPageId, propertyAlias: undefined },
      extra,
    );
    const inspectData = getStructuredContent(inspectResult) as any;

    if (!inspectData?.blockProperties?.length || !inspectData.blockProperties[0]?.blocks?.length) {    }

    const firstBlockProp = inspectData.blockProperties[0];
    const firstBlock = firstBlockProp.blocks[0];

    const targetPropAlias = firstBlock.properties[0].alias;
    const originalValue = firstBlock.properties[0].value;

    const result = await bulkSetBlockPropertyTool.handler(
      {
        ids: [firstRootPageId],
        contentTypeKey: firstBlock.contentTypeKey,
        propertyAlias: firstBlockProp.propertyAlias,
        values: [{ alias: targetPropAlias, value: originalValue }],
        culture: undefined,
        segment: undefined,
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results.length).toBe(1);
    expect(data.results[0].success).toBe(true);
    expect(data.results[0].blocksUpdated).toBeGreaterThanOrEqual(1);
    expect(data.totalBlocksUpdated).toBeGreaterThanOrEqual(1);
    expect(data.successCount).toBe(1);
  }, 60000);

  it("should return success with 0 blocks updated when no blocks match", async () => {
    const result = await bulkSetBlockPropertyTool.handler(
      {
        ids: [firstRootPageId],
        contentTypeKey: FAKE_CONTENT_TYPE_KEY,
        propertyAlias: "contentRows",
        values: [{ alias: "caption", value: "Test" }],
        culture: undefined,
        segment: undefined,
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results[0].success).toBe(true);
    expect(data.results[0].blocksUpdated).toBe(0);
    expect(data.totalBlocksUpdated).toBe(0);
  }, 30000);

  it("should cancel when elicitation is rejected", async () => {
    elicitation.rejectAll();

    const result = await bulkSetBlockPropertyTool.handler(
      {
        ids: [firstRootPageId],
        contentTypeKey: FAKE_CONTENT_TYPE_KEY,
        propertyAlias: "contentRows",
        values: [{ alias: "caption", value: "Test" }],
        culture: undefined,
        segment: undefined,
      },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data?.message?.includes("Cancelled") || result.isError).toBe(true);
  }, 30000);

  it("marks a page's row as failed when a property alias doesn't exist on the block's element type", async () => {
    // Pre-fix, update-block-property's top-level success===true was the only
    // thing checked, so this per-block failure was reported as
    // blocksUpdated: blocks.length instead of a real error.
    expect(blockFixture).not.toBeNull();
    const f = blockFixture!;

    const result = await callTool(bulkSetBlockPropertyTool, {
      ids: [f.pageId],
      contentTypeKey: f.elementTypeId,
      propertyAlias: f.propertyAlias,
      values: [{ alias: "_notARealPropertyAliasOnThisElementType", value: "_should not apply" }],
      culture: undefined,
      segment: undefined,
    }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.results).toHaveLength(1);
    expect(data.results[0].success).toBe(false);
    expect(data.results[0].blocksUpdated).toBe(0);
    expect(typeof data.results[0].error).toBe("string");
    expect(data.results[0].error).toContain("Block update failed");
    expect(data.failureCount).toBe(1);
    expect(data.successCount).toBe(0);
  }, 60000);

  it("reports a partial failure — and still saves the valid alias — when only one of several aliases is invalid", async () => {
    // Upstream `update-block-property` reports `success: true` on this result
    // whenever at least one property saved, even if another alias in the same
    // call failed — so a plain `success !== true` check misses this case and
    // would report a full success while silently dropping the invalid alias's
    // value.
    expect(blockFixture).not.toBeNull();
    const f = blockFixture!;
    const validValue = "_bulk partial write valid value";

    const result = await callTool(bulkSetBlockPropertyTool, {
      ids: [f.pageId],
      contentTypeKey: f.elementTypeId,
      propertyAlias: f.propertyAlias,
      values: [
        { alias: f.blockPropertyAlias, value: validValue },
        { alias: "_notARealPropertyAliasOnThisElementType", value: "_should not apply" },
      ],
      culture: undefined,
      segment: undefined,
    }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.results).toHaveLength(1);
    expect(data.results[0].success).toBe(false);
    expect(data.results[0].error.message).toContain("partially failed");
    expect(data.results[0].error.savedFields).toEqual([f.blockPropertyAlias]);
    expect(data.results[0].error.failedFields).toEqual(["_notARealPropertyAliasOnThisElementType"]);
    // The one matched block did get the valid alias saved — it should count
    // toward blocksUpdated, not report 0 just because the row overall failed.
    expect(data.results[0].blocksUpdated).toBe(1);
    expect(data.totalBlocksUpdated).toBe(1);
    expect(data.failureCount).toBe(1);
    expect(data.successCount).toBe(0);
    // A partial write still changed the document — validation/previewUrl are
    // worth returning even though the row is marked failed.
    expect(typeof data.results[0].validation?.valid).toBe("boolean");
    expect(data.results[0].previewUrl?.url).toEqual(expect.any(String));

    const inspectResult = await inspectBlocksTool.handler(
      { id: f.pageId, propertyAlias: f.propertyAlias },
      extra,
    );
    const inspectData = getStructuredContent(inspectResult) as any;
    const block = (inspectData?.blockProperties ?? [])
      .flatMap((bp: any) => bp.blocks ?? [])
      .find((b: any) => b.contentKey === f.seededBlockKey);
    const updatedProp = (block?.properties ?? []).find((p: any) => p.alias === f.blockPropertyAlias);
    expect(updatedProp?.value).toBe(validValue);
  }, 60000);

  it("counts blocksUpdated across multiple matching blocks on the same page when a partial failure occurs", async () => {
    // bulk-set-block-property can match more than one block of the same
    // element type on a single page — the cleanCount/updatedEntryCount
    // arithmetic needs to scale across all of them, not just the single-block
    // case covered above.
    expect(blockFixture).not.toBeNull();
    const f = blockFixture!;
    const SECOND_BLOCK_KEY = "33333333-3333-4333-8333-333333333333";
    const validValue = "_bulk multi-block partial write value";

    const blockListValue = {
      contentData: [
        {
          key: f.seededBlockKey,
          contentTypeKey: f.elementTypeId,
          values: [{ alias: f.blockPropertyAlias, value: "_original A", culture: null, segment: null }],
        },
        {
          key: SECOND_BLOCK_KEY,
          contentTypeKey: f.elementTypeId,
          values: [{ alias: f.blockPropertyAlias, value: "_original B", culture: null, segment: null }],
        },
      ],
      settingsData: [],
      layout: {
        "Umbraco.BlockList": [{ contentKey: f.seededBlockKey }, { contentKey: SECOND_BLOCK_KEY }],
      },
      expose: [
        { contentKey: f.seededBlockKey, culture: null, segment: null },
        { contentKey: SECOND_BLOCK_KEY, culture: null, segment: null },
      ],
    };

    const parentId = (await initContentTestState(extra)).testPageId;
    const page = await new ContentBuilder()
      .withName("_Test bulk-set-block-property two-block fixture")
      .withDocumentType(f.donorDocTypeId)
      .withParent(parentId)
      .withValue(f.propertyAlias, blockListValue)
      .create();
    const pageId = page.getId();

    try {
      const result = await callTool(bulkSetBlockPropertyTool, {
        ids: [pageId],
        contentTypeKey: f.elementTypeId,
        propertyAlias: f.propertyAlias,
        values: [
          { alias: f.blockPropertyAlias, value: validValue },
          { alias: "_notARealPropertyAliasOnThisElementType", value: "_should not apply" },
        ],
        culture: undefined,
        segment: undefined,
      }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.results).toHaveLength(1);
      expect(data.results[0].success).toBe(false);
      expect(data.results[0].error.message).toContain("partially failed");
      expect(data.results[0].error.savedFields).toEqual([f.blockPropertyAlias]);
      expect(data.results[0].error.failedFields).toEqual(["_notARealPropertyAliasOnThisElementType"]);
      // Both matched blocks got the valid alias saved, even though the
      // invalid alias failed on both — blocksUpdated should reflect both.
      expect(data.results[0].blocksUpdated).toBe(2);
      expect(data.totalBlocksUpdated).toBe(2);

      const inspectResult = await inspectBlocksTool.handler({ id: pageId, propertyAlias: f.propertyAlias }, extra);
      const inspectData = getStructuredContent(inspectResult) as any;
      const blocks = (inspectData?.blockProperties ?? []).flatMap((bp: any) => bp.blocks ?? []);
      for (const key of [f.seededBlockKey, SECOND_BLOCK_KEY]) {
        const block = blocks.find((b: any) => b.contentKey === key);
        const updatedProp = (block?.properties ?? []).find((p: any) => p.alias === f.blockPropertyAlias);
        expect(updatedProp?.value).toBe(validValue);
      }
    } finally {
      await ContentTestHelper.cleanupById(pageId);
    }
  }, 60000);

  it("skips subsequent pages after a per-block failure on an earlier page", async () => {
    expect(blockFixture).not.toBeNull();
    const f = blockFixture!;

    const result = await callTool(bulkSetBlockPropertyTool, {
      ids: [f.pageId, firstRootPageId],
      contentTypeKey: f.elementTypeId,
      propertyAlias: f.propertyAlias,
      values: [{ alias: "_notARealPropertyAliasOnThisElementType", value: "_should not apply" }],
      culture: undefined,
      segment: undefined,
    }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.results).toHaveLength(2);

    // First page: the real per-block failure (same as the single-ID case above).
    expect(data.results[0].success).toBe(false);
    expect(data.results[0].blocksUpdated).toBe(0);
    expect(data.results[0].error).toContain("Block update failed");

    // Second page: never attempted — fail-fast skips it regardless of whether
    // it has any matching blocks of its own.
    expect(data.results[1].success).toBe(false);
    expect(data.results[1].blocksUpdated).toBe(0);
    expect(data.results[1].error).toBe(SKIPPED_SENTINEL);

    expect(data.failureCount).toBe(1);
    expect(data.skippedCount).toBe(1);
    expect(data.successCount).toBe(0);
  }, 60000);
});
