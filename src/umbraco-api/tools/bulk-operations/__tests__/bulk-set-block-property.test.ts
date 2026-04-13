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
import bulkSetBlockPropertyTool from "../post/bulk-set-block-property.js";
import inspectBlocksTool from "../../content/get/inspect-blocks.js";

const elicitation = createElicitation();

describe("bulk-set-block-property", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let firstRootPageId: string;

  beforeAll(async () => {
    const state = await initBulkOperationsTestState(extra);
    firstRootPageId = state.firstRootPageId;
  }, 60000);

  afterAll(async () => {
    elicitation.cleanup();
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

    if (!inspectData?.blockProperties?.length || !inspectData.blockProperties[0]?.blocks?.length) {
      console.warn("Skipping bulk-set-block-property test: no blocks found on first root page");
      return;
    }

    const firstBlockProp = inspectData.blockProperties[0];
    const firstBlock = firstBlockProp.blocks[0];

    if (!firstBlock.properties?.length) {
      console.warn("Skipping bulk-set-block-property test: block has no properties");
      return;
    }

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
});
