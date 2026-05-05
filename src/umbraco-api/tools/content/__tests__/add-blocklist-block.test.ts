import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createElicitation,
  expectElicitationCancel,
  ContentTestHelper,
  extractChainedResult,
} from "./setup.js";
import { mcpClientManager } from "../../../mcp-client.js";
import addBlocklistBlockTool from "../post/add-blocklist-block.js";
import inspectBlocksTool from "../get/inspect-blocks.js";
import { createBlockListFixture, type BlockListFixture } from "./helpers/block-fixture.js";

async function getBlockListLayout(pageId: string, propertyAlias: string): Promise<Array<{ contentKey: string; settingsKey?: string }>> {
  const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: pageId });
  const doc = extractChainedResult(docResult);
  const prop = (doc.values ?? []).find((v: any) => v.alias === propertyAlias);
  return prop?.value?.layout?.["Umbraco.BlockList"] ?? [];
}

const elicitation = createElicitation();

describe("add-blocklist-block", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let fixture: BlockListFixture | null = null;
  const adHocPages: string[] = [];

  beforeAll(async () => {
    fixture = await createBlockListFixture(extra, "_Test add-blocklist-block fixture");
  }, 120000);

  beforeEach(() => {
    elicitation.reset();
  });

  afterAll(async () => {
    elicitation.cleanup();
    if (fixture) await fixture.cleanup();
    while (adHocPages.length > 0) {
      const id = adHocPages.pop()!;
      await ContentTestHelper.cleanupById(id);
    }
  }, 60000);

  function skipIfNoFixture() {
    if (!fixture) {
      // No BlockList donor on this Umbraco instance — skip the test rather than fail.
      // The demo site usually has one, but custom installs may not.
      return true;
    }
    return false;
  }

  it("appends a new block to an existing BlockList by default", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const result = await addBlocklistBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_appended block value" }],
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
    expect(data.id).toBe(f.pageId);

    const layout = await getBlockListLayout(f.pageId, f.propertyAlias);
    expect(layout.length).toBeGreaterThanOrEqual(2);
    // append → new block goes at the end of the layout
    expect(layout[layout.length - 1].contentKey).toBe(data.contentKey);
  }, 60000);

  it("prepends a new block when position.mode = 'prepend'", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const result = await addBlocklistBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_prepended block value" }],
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
    const layout = await getBlockListLayout(f.pageId, f.propertyAlias);
    expect(layout[0].contentKey).toBe(data.contentKey);
  }, 60000);

  it("inserts before/after an anchor block by contentKey", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const beforeResult = await addBlocklistBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_before-anchor block value" }],
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

    const afterResult = await addBlocklistBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_after-anchor block value" }],
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

    const layout = await getBlockListLayout(f.pageId, f.propertyAlias);
    const keys = layout.map(item => item.contentKey);
    const seededIndex = keys.indexOf(f.seededBlockKey);
    expect(seededIndex).toBeGreaterThan(0);
    expect(keys[seededIndex - 1]).toBe(beforeData.contentKey);
    expect(keys[seededIndex + 1]).toBe(afterData.contentKey);
  }, 60000);

  it("rejects 'before' without anchorContentKey", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const result = await addBlocklistBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_no-anchor" }],
        position: { mode: "before", anchorContentKey: undefined },
        settingsTypeKey: undefined,
        settingsValues: undefined,
        culture: undefined,
        segment: undefined,
      },
      extra,
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("anchorContentKey");
  }, 30000);

  it("rejects when settingsValues is provided without settingsTypeKey", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const result = await addBlocklistBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_orphan settings" }],
        position: undefined,
        settingsTypeKey: undefined,
        settingsValues: [{ alias: "anything", value: "x" }],
        culture: undefined,
        segment: undefined,
      },
      extra,
    );
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("settingsTypeKey");
  }, 30000);

  it("rejects when targeted property is not a BlockList", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const result = await addBlocklistBlockTool.handler(
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

  it("creates a block with both content and settings when settingsTypeKey is provided", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;
    if (!f.settings) {
      // Demo donor doesn't expose a settings element type — skip rather than fail.
      return;
    }

    const result = await addBlocklistBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_with-settings content" }],
        position: undefined,
        settingsTypeKey: f.settings.settingsElementTypeId,
        settingsValues: [{ alias: f.settings.settingsPropertyAlias, value: "_with-settings settings" }],
        culture: undefined,
        segment: undefined,
      },
      extra,
    );
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;

    const layout = await getBlockListLayout(f.pageId, f.propertyAlias);
    const newEntry = layout.find(item => item.contentKey === data.contentKey);
    expect(newEntry).toBeDefined();
    expect(typeof newEntry!.settingsKey).toBe("string");
    expect(newEntry!.settingsKey).toMatch(/^[0-9a-f-]{36}$/i);
  }, 60000);

  it("does not modify the page when the user declines confirmation", async () => {
    if (skipIfNoFixture()) return;
    const f = fixture!;

    const inspectBefore = await inspectBlocksTool.handler({ id: f.pageId, propertyAlias: f.propertyAlias }, extra);
    const propBefore = (getStructuredContent(inspectBefore) as any).blockProperties.find((p: any) => p.propertyAlias === f.propertyAlias);
    const beforeCount = propBefore.blocks.length;

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      addBlocklistBlockTool.handler(
        {
          id: f.pageId,
          propertyAlias: f.propertyAlias,
          contentTypeKey: f.elementTypeId,
          values: [{ alias: f.blockPropertyAlias, value: "_should-not-land" }],
          position: undefined,
          settingsTypeKey: undefined,
          settingsValues: undefined,
          culture: undefined,
          segment: undefined,
        },
        extra,
      ),
    );

    const inspectAfter = await inspectBlocksTool.handler({ id: f.pageId, propertyAlias: f.propertyAlias }, extra);
    const propAfter = (getStructuredContent(inspectAfter) as any).blockProperties.find((p: any) => p.propertyAlias === f.propertyAlias);
    expect(propAfter.blocks.length).toBe(beforeCount);
  }, 60000);
});
