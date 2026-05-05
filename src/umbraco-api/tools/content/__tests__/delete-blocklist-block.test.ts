/**
 * delete-block — BlockList scenarios
 *
 * Covers BlockList-specific paths plus the editor-agnostic error/decline paths
 * (using a BlockList fixture as the convenient host).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createElicitation,
  expectElicitationCancel,
  extractChainedResult,
} from "./setup.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import deleteBlockTool from "../delete/delete-block.js";
import addBlocklistBlockTool from "../post/add-blocklist-block.js";
import { createBlockListFixture, type BlockListFixture } from "./helpers/block-fixture.js";

const SEEDED_BLOCK_KEY = "11111111-1111-4111-8111-111111111111";
const SEEDED_SETTINGS_KEY = "22222222-2222-4222-8222-222222222222";

async function getPropValue(pageId: string, propertyAlias: string): Promise<any> {
  const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: pageId });
  const doc = extractChainedResult(docResult);
  return (doc.values ?? []).find((v: any) => v.alias === propertyAlias)?.value ?? null;
}

const elicitation = createElicitation();

describe("delete-block — BlockList", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let fixture: BlockListFixture | null = null;
  let settingsFixture: BlockListFixture | null = null;

  beforeAll(async () => {
    fixture = await createBlockListFixture(extra, "_Test delete-block BlockList fixture");
    settingsFixture = await createBlockListFixture(
      extra,
      "_Test delete-block BlockList settings fixture",
      { seedSettings: true },
    );
  }, 120000);

  beforeEach(() => {
    elicitation.reset();
  });

  afterAll(async () => {
    elicitation.cleanup();
    if (fixture) await fixture.cleanup();
    if (settingsFixture) await settingsFixture.cleanup();
  }, 60000);

  it("deletes the seeded block and leaves sibling blocks intact", async () => {
    if (!fixture) return;
    const f = fixture;

    const appendResult = await addBlocklistBlockTool.handler(
      {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentTypeKey: f.elementTypeId,
        values: [{ alias: f.blockPropertyAlias, value: "_sibling block" }],
        position: undefined,
        settingsTypeKey: undefined,
        settingsValues: undefined,
        culture: undefined,
        segment: undefined,
      },
      extra,
    );
    expect(appendResult.isError).toBeFalsy();
    const appendedKey = (getStructuredContent(appendResult) as any).contentKey as string;

    const result = await callTool(deleteBlockTool, {
      id: f.pageId,
      propertyAlias: f.propertyAlias,
      contentKey: SEEDED_BLOCK_KEY,
      culture: undefined,
      segment: undefined,
    }, extra);
    expect(result.isError).toBeFalsy();

    const data = getStructuredContent(result) as any;
    expect(data.contentKey).toBe(SEEDED_BLOCK_KEY);
    expect(data.id).toBe(f.pageId);

    const propValue = await getPropValue(f.pageId, f.propertyAlias);
    const contentData: any[] = propValue?.contentData ?? [];
    const layout: any[] = propValue?.layout?.["Umbraco.BlockList"] ?? [];
    const expose: any[] = propValue?.expose ?? [];

    expect(contentData.some(e => e.key === SEEDED_BLOCK_KEY)).toBe(false);
    expect(layout.some(e => e.contentKey === SEEDED_BLOCK_KEY)).toBe(false);
    expect(expose.some(e => e.contentKey === SEEDED_BLOCK_KEY)).toBe(false);

    expect(contentData.some(e => e.key === appendedKey)).toBe(true);
    expect(layout.some(e => e.contentKey === appendedKey)).toBe(true);
  }, 60000);

  it("deleting a block with settings also drops its settingsData entry", async () => {
    if (!settingsFixture || !settingsFixture.seededSettingsKey) return;
    const f = settingsFixture;

    const result = await callTool(deleteBlockTool, {
      id: f.pageId,
      propertyAlias: f.propertyAlias,
      contentKey: SEEDED_BLOCK_KEY,
      culture: undefined,
      segment: undefined,
    }, extra);
    expect(result.isError).toBeFalsy();

    const propValue = await getPropValue(f.pageId, f.propertyAlias);
    const settingsData: any[] = propValue?.settingsData ?? [];
    expect(settingsData.some(e => e.key === SEEDED_SETTINGS_KEY)).toBe(false);
  }, 60000);

  it("errors cleanly when contentKey does not exist — no confirm prompt shown", async () => {
    if (!fixture) return;
    const f = fixture;

    const UNKNOWN_KEY = "deadbeef-dead-4ead-8ead-deadbeefcafe";
    const result = await callTool(deleteBlockTool, {
      id: f.pageId,
      propertyAlias: f.propertyAlias,
      contentKey: UNKNOWN_KEY,
      culture: undefined,
      segment: undefined,
    }, extra);
    expect(result.isError).toBe(true);
    expect(elicitation.mock.mock.calls).toHaveLength(0);
  }, 30000);

  it("errors when the property does not exist on the page — no confirm prompt shown", async () => {
    if (!fixture) return;
    const f = fixture;

    const result = await callTool(deleteBlockTool, {
      id: f.pageId,
      propertyAlias: "no_such_property_zzz",
      contentKey: SEEDED_BLOCK_KEY,
      culture: undefined,
      segment: undefined,
    }, extra);
    expect(result.isError).toBe(true);
    expect(elicitation.mock.mock.calls).toHaveLength(0);
    expect(JSON.stringify(result)).toContain("not found");
  }, 30000);

  it("leaves the page unchanged when the user declines confirmation", async () => {
    if (!fixture) return;
    const f = fixture;

    const propBefore = await getPropValue(f.pageId, f.propertyAlias);
    const layoutBefore: any[] = propBefore?.layout?.["Umbraco.BlockList"] ?? [];
    if (layoutBefore.length === 0) return;
    const targetKey: string = layoutBefore[0].contentKey;

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      callTool(deleteBlockTool, {
        id: f.pageId,
        propertyAlias: f.propertyAlias,
        contentKey: targetKey,
        culture: undefined,
        segment: undefined,
      }, extra),
    );

    const propAfter = await getPropValue(f.pageId, f.propertyAlias);
    const contentDataAfter: any[] = propAfter?.contentData ?? [];
    expect(contentDataAfter.some(e => e.key === targetKey)).toBe(true);
    expect(contentDataAfter.length).toBe((propBefore?.contentData ?? []).length);
  }, 60000);
});
