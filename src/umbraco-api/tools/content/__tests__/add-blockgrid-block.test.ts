import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  ContentTestHelper,
  extractChainedResult,
} from "./setup.js";
import { mcpClientManager } from "../../../mcp-client.js";
import addBlockgridBlockTool from "../post/add-blockgrid-block.js";
import { createBlockGridFixture, type BlockGridFixture } from "./helpers/block-fixture.js";
import { ContentBuilder } from "./helpers/content-builder.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

type GridLayoutItem = {
  contentKey: string;
  settingsKey?: string;
  columnSpan?: number;
  rowSpan?: number;
  areas?: Array<{ key: string; items: GridLayoutItem[] }>;
};

async function getBlockGridLayout(pageId: string, propertyAlias: string): Promise<GridLayoutItem[]> {
  const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: pageId });
  const doc = extractChainedResult(docResult);
  const prop = (doc.values ?? []).find((v: any) => v.alias === propertyAlias);
  return prop?.value?.layout?.["Umbraco.BlockGrid"] ?? [];
}

describe("add-blockgrid-block", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let fixture: BlockGridFixture | null = null;

  beforeAll(async () => {
    fixture = await createBlockGridFixture(extra, "_Test add-blockgrid-block fixture");
  }, 120000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  }, 60000);

  function skipIfNoFixture() {
    return !fixture;
  }

  it("appends a new block to a top-level BlockGrid layout with default span", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const result = await addBlockgridBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_appended grid block" }],
        position: undefined,
        columnSpan: undefined,
        rowSpan: undefined,
        areaKey: undefined,
        parentContentKey: undefined,
        settingsTypeKey: undefined,
        settingsValues: undefined,
        culture: undefined,
        segment: undefined,
      },
      extra,
    );
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.contentKey).toMatch(/^[0-9a-f-]{36}$/i);

    const layout = await getBlockGridLayout(f.pageId, f.propertyAlias);
    // append → new block at the end of the layout
    expect(layout[layout.length - 1].contentKey).toBe(data.contentKey);
    // default spans applied
    expect(layout[layout.length - 1].columnSpan).toBe(12);
    expect(layout[layout.length - 1].rowSpan).toBe(1);
  }, 60000);

  it("prepends a new block when position.mode = 'prepend'", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const result = await addBlockgridBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_prepended grid block" }],
        position: { mode: "prepend", anchorContentKey: undefined },
        columnSpan: undefined,
        rowSpan: undefined,
        areaKey: undefined,
        parentContentKey: undefined,
        settingsTypeKey: undefined,
        settingsValues: undefined,
        culture: undefined,
        segment: undefined,
      },
      extra,
    );
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    const layout = await getBlockGridLayout(f.pageId, f.propertyAlias);
    expect(layout[0].contentKey).toBe(data.contentKey);
  }, 60000);

  it("inserts before/after an anchor block by contentKey", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const beforeResult = await addBlockgridBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_before-anchor grid block" }],
        position: { mode: "before", anchorContentKey: f.seededBlockKey },
        columnSpan: undefined, rowSpan: undefined, areaKey: undefined, parentContentKey: undefined,
        settingsTypeKey: undefined, settingsValues: undefined, culture: undefined, segment: undefined,
      },
      extra,
    );
    expect(beforeResult.isError).toBeFalsy();
    const beforeData = getStructuredContent(beforeResult) as any;

    const afterResult = await addBlockgridBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_after-anchor grid block" }],
        position: { mode: "after", anchorContentKey: f.seededBlockKey },
        columnSpan: undefined, rowSpan: undefined, areaKey: undefined, parentContentKey: undefined,
        settingsTypeKey: undefined, settingsValues: undefined, culture: undefined, segment: undefined,
      },
      extra,
    );
    expect(afterResult.isError).toBeFalsy();
    const afterData = getStructuredContent(afterResult) as any;

    const layout = await getBlockGridLayout(f.pageId, f.propertyAlias);
    const keys = layout.map(item => item.contentKey);
    const seededIndex = keys.indexOf(f.seededBlockKey);
    expect(seededIndex).toBeGreaterThan(0);
    expect(keys[seededIndex - 1]).toBe(beforeData.contentKey);
    expect(keys[seededIndex + 1]).toBe(afterData.contentKey);
  }, 60000);

  it("respects explicit columnSpan and rowSpan", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const result = await addBlockgridBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_custom-span grid block" }],
        position: undefined,
        columnSpan: 6,
        rowSpan: 2,
        areaKey: undefined,
        parentContentKey: undefined,
        settingsTypeKey: undefined,
        settingsValues: undefined,
        culture: undefined,
        segment: undefined,
      },
      extra,
    );
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;

    const layout = await getBlockGridLayout(f.pageId, f.propertyAlias);
    const newEntry = layout.find(item => item.contentKey === data.contentKey);
    expect(newEntry?.columnSpan).toBe(6);
    expect(newEntry?.rowSpan).toBe(2);
  }, 60000);

  it("rejects 'before' without anchorContentKey", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const result = await addBlockgridBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_no-anchor grid" }],
        position: { mode: "before", anchorContentKey: undefined },
        columnSpan: undefined, rowSpan: undefined, areaKey: undefined, parentContentKey: undefined,
        settingsTypeKey: undefined, settingsValues: undefined, culture: undefined, segment: undefined,
      },
      extra,
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("anchorContentKey");
  }, 30000);

  it("rejects areaKey without parentContentKey", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const result = await addBlockgridBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_orphan area" }],
        position: undefined,
        columnSpan: undefined, rowSpan: undefined,
        areaKey: "00000000-0000-0000-0000-000000000001",
        parentContentKey: undefined,
        settingsTypeKey: undefined, settingsValues: undefined, culture: undefined, segment: undefined,
      },
      extra,
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("parentContentKey");
  }, 30000);

  it("rejects when targeted property is not a BlockGrid", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const result = await addBlockgridBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: "nonExistentPropertyAlias_zzz",
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_irrelevant" }],
        position: undefined,
        columnSpan: undefined, rowSpan: undefined, areaKey: undefined, parentContentKey: undefined,
        settingsTypeKey: undefined, settingsValues: undefined, culture: undefined, segment: undefined,
      },
      extra,
    );
    expect(result.isError).toBe(true);
  }, 30000);

  it("adds first block to a BlockGrid property that has no value yet (regression: empty property)", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    // Create a fresh page using the same doctype but WITHOUT seeding any block value.
    const freshPage = await new ContentBuilder()
      .withName("_Test add-blockgrid-block empty-property regression")
      .withDocumentType(f.donorDocTypeId)
      .create();
    const freshPageId = freshPage.getId();

    try {
      const result = await callTool(addBlockgridBlockTool, {
        id: freshPageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_first block on empty property" }],
        position: undefined,
        columnSpan: undefined,
        rowSpan: undefined,
        areaKey: undefined,
        parentContentKey: undefined,
        settingsTypeKey: undefined,
        settingsValues: undefined,
        culture: undefined,
        segment: undefined,
      }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.contentKey).toMatch(/^[0-9a-f-]{36}$/i);
      expect(data.id).toBe(freshPageId);

      // Verify the block actually landed
      const layout = await getBlockGridLayout(freshPageId, f.propertyAlias);
      expect(layout.length).toBe(1);
      expect(layout[0].contentKey).toBe(data.contentKey);
    } finally {
      await ContentTestHelper.cleanupById(freshPageId);
    }
  }, 60000);
});
