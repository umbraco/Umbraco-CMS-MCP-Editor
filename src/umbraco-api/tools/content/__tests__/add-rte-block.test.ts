import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  ContentTestHelper,
  extractChainedResult,
} from "./setup.js";
import { mcpClientManager } from "../../../mcp-client.js";
import addRteBlockTool from "../post/add-rte-block.js";
import inspectBlocksTool from "../get/inspect-blocks.js";
import { createRteFixture, type RteFixture } from "./helpers/block-fixture.js";
import { ContentBuilder } from "./helpers/content-builder.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

async function getRteValue(pageId: string, propertyAlias: string): Promise<{ markup?: string; blocks?: { layout?: any; contentData?: any[] } } | undefined> {
  const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: pageId });
  const doc = extractChainedResult(docResult);
  return (doc.values ?? []).find((v: any) => v.alias === propertyAlias)?.value;
}

describe("add-rte-block", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let fixture: RteFixture | null = null;

  beforeAll(async () => {
    fixture = await createRteFixture(extra, "_Test add-rte-block fixture");
  }, 120000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  }, 60000);

  function skipIfNoFixture() {
    return !fixture;
  }

  it("appends a new block tag to the rich text markup and registers the block content", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const result = await addRteBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_appended rte block" }],
        position: undefined,
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

    // Block content registered
    const inspect = await inspectBlocksTool.handler({ id: f.pageId, propertyAlias: f.propertyAlias }, extra);
    const prop = (getStructuredContent(inspect) as any).blockProperties.find((p: any) => p.propertyAlias === f.propertyAlias);
    expect(prop.blocks.length).toBeGreaterThanOrEqual(2);

    // Markup carries the tag, after the seeded one
    const value = await getRteValue(f.pageId, f.propertyAlias);
    expect(value?.markup).toContain(`data-content-key="${data.contentKey}"`);
    expect(value!.markup!.indexOf(f.seededBlockKey)).toBeLessThan(value!.markup!.indexOf(data.contentKey));
  }, 60000);

  it("prepends a new block tag at the start of the markup", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const result = await addRteBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_prepended rte block" }],
        position: { mode: "prepend", anchorContentKey: undefined },
        settingsTypeKey: undefined,
        settingsValues: undefined,
        culture: undefined,
        segment: undefined,
      },
      extra,
    );
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;

    const value = await getRteValue(f.pageId, f.propertyAlias);
    // Prepended tag comes before any other content
    expect(value!.markup!.indexOf(`data-content-key="${data.contentKey}"`)).toBe(0);
  }, 60000);

  it("inserts before/after an anchor block by contentKey", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const beforeResult = await addRteBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_before-anchor rte block" }],
        position: { mode: "before", anchorContentKey: f.seededBlockKey },
        settingsTypeKey: undefined,
        settingsValues: undefined,
        culture: undefined,
        segment: undefined,
      },
      extra,
    );
    expect(beforeResult.isError).toBeFalsy();
    const beforeData = getStructuredContent(beforeResult) as any;

    const afterResult = await addRteBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_after-anchor rte block" }],
        position: { mode: "after", anchorContentKey: f.seededBlockKey },
        settingsTypeKey: undefined,
        settingsValues: undefined,
        culture: undefined,
        segment: undefined,
      },
      extra,
    );
    expect(afterResult.isError).toBeFalsy();
    const afterData = getStructuredContent(afterResult) as any;

    const value = await getRteValue(f.pageId, f.propertyAlias);
    const markup = value!.markup!;
    const beforeIdx = markup.indexOf(`data-content-key="${beforeData.contentKey}"`);
    const seededIdx = markup.indexOf(`data-content-key="${f.seededBlockKey}"`);
    const afterIdx = markup.indexOf(`data-content-key="${afterData.contentKey}"`);
    expect(beforeIdx).toBeGreaterThanOrEqual(0);
    expect(afterIdx).toBeGreaterThan(seededIdx);
    expect(beforeIdx).toBeLessThan(seededIdx);
  }, 60000);

  it("rejects 'after' against an unknown anchor", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const result = await addRteBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_unknown-anchor" }],
        position: { mode: "after", anchorContentKey: "00000000-0000-0000-0000-000000000099" },
        settingsTypeKey: undefined,
        settingsValues: undefined,
        culture: undefined,
        segment: undefined,
      },
      extra,
    );
    expect(result.isError).toBe(true);
  }, 30000);

  it("rejects when targeted property is not a Rich Text with blocks", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const result = await addRteBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: "nonExistentPropertyAlias_zzz",
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_irrelevant" }],
        position: undefined,
        settingsTypeKey: undefined,
        settingsValues: undefined,
        culture: undefined,
        segment: undefined,
      },
      extra,
    );
    expect(result.isError).toBe(true);
  }, 30000);

  it("adds first block to an RTE property that has no value yet (regression: empty property)", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    // Create a fresh page using the same doctype but WITHOUT seeding any RTE value.
    const freshPage = await new ContentBuilder()
      .withName("_Test add-rte-block empty-property regression")
      .withDocumentType(f.donorDocTypeId)
      .create();
    const freshPageId = freshPage.getId();

    try {
      const result = await callTool(addRteBlockTool, {
        id: freshPageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_first block on empty rte" }],
        position: undefined,
        settingsTypeKey: undefined,
        settingsValues: undefined,
        culture: undefined,
        segment: undefined,
      }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.contentKey).toMatch(/^[0-9a-f-]{36}$/i);
      expect(data.id).toBe(freshPageId);

      // Verify the block tag landed in the markup
      const value = await getRteValue(freshPageId, f.propertyAlias);
      expect(value?.markup).toContain(`data-content-key="${data.contentKey}"`);
    } finally {
      await ContentTestHelper.cleanupById(freshPageId);
    }
  }, 60000);
});
