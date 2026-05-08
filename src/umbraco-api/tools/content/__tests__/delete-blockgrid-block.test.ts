/**
 * delete-block — BlockGrid scenarios
 *
 * Covers the top-level deletion path and the recursive nested-area path.
 * The nested-area test builds a deterministic page with a parent block + one
 * child item inside a named area so the test can assert the parent survives
 * and only the area item is removed.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createElicitation,
  ContentBuilder,
  ContentTestHelper,
  extractChainedResult,
  initContentTestState,
} from "./setup.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import deleteBlockTool from "../delete/delete-block.js";
import { createBlockGridFixture, type BlockGridFixture } from "./helpers/block-fixture.js";

const SEEDED_BLOCK_KEY = "11111111-1111-4111-8111-111111111111";
const NESTED_PARENT_KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const NESTED_CHILD_KEY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NESTED_AREA_KEY = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

async function getPropValue(pageId: string, propertyAlias: string): Promise<any> {
  const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: pageId });
  const doc = extractChainedResult(docResult);
  return (doc.values ?? []).find((v: any) => v.alias === propertyAlias)?.value ?? null;
}

const elicitation = createElicitation();

describe("delete-block — BlockGrid", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let topLevelFixture: BlockGridFixture | null = null;
  let nestedFixture: BlockGridFixture | null = null;
  let nestedPageId: string | null = null;

  beforeAll(async () => {
    topLevelFixture = await createBlockGridFixture(extra, "_Test delete-block BlockGrid top-level fixture");
    nestedFixture = await createBlockGridFixture(extra, "_Test delete-block BlockGrid nested fixture");

    if (nestedFixture) {
      const f = nestedFixture;
      const state = await initContentTestState(extra);

      const nestedGridValue = {
        contentData: [
          { key: NESTED_PARENT_KEY, contentTypeKey: f.elementTypeId, values: [{ alias: f.blockPropertyAlias, value: "_parent block", culture: null, segment: null }] },
          { key: NESTED_CHILD_KEY, contentTypeKey: f.elementTypeId, values: [{ alias: f.blockPropertyAlias, value: "_nested child", culture: null, segment: null }] },
        ],
        settingsData: [],
        layout: {
          "Umbraco.BlockGrid": [
            {
              contentKey: NESTED_PARENT_KEY,
              columnSpan: 12,
              rowSpan: 1,
              areas: [
                { key: NESTED_AREA_KEY, items: [{ contentKey: NESTED_CHILD_KEY, columnSpan: 12, rowSpan: 1, areas: [] }] },
              ],
            },
          ],
        },
        expose: [
          { contentKey: NESTED_PARENT_KEY, culture: null, segment: null },
          { contentKey: NESTED_CHILD_KEY, culture: null, segment: null },
        ],
      };

      const page = await new ContentBuilder()
        .withName("_Test delete-block BlockGrid nested-area page")
        .withDocumentType(f.donorDocTypeId)
        .withParent(state.testPageId)
        .withValue(f.propertyAlias, nestedGridValue)
        .create();
      nestedPageId = page.getId();
    }
  }, 180000);

  beforeEach(() => {
    elicitation.reset();
  });

  afterAll(async () => {
    elicitation.cleanup();
    if (topLevelFixture) await topLevelFixture.cleanup();
    if (nestedFixture) await nestedFixture.cleanup();
    if (nestedPageId) await ContentTestHelper.cleanupById(nestedPageId);
  }, 60000);

  it("deletes a top-level block and removes it from layout and contentData", async () => {
    if (!topLevelFixture) return;
    const f = topLevelFixture;

    const result = await callTool(deleteBlockTool, {
      id: f.pageId,
      propertyAlias: f.propertyAlias,
      contentKey: SEEDED_BLOCK_KEY,
      culture: undefined,
      segment: undefined,
    }, extra);
    expect(result.isError).toBeFalsy();
    expect((getStructuredContent(result) as any).contentKey).toBe(SEEDED_BLOCK_KEY);

    const propValue = await getPropValue(f.pageId, f.propertyAlias);
    const contentData: any[] = propValue?.contentData ?? [];
    const layout: any[] = propValue?.layout?.["Umbraco.BlockGrid"] ?? [];

    expect(contentData.some(e => e.key === SEEDED_BLOCK_KEY)).toBe(false);
    expect(layout.some(e => e.contentKey === SEEDED_BLOCK_KEY)).toBe(false);
  }, 60000);

  it("deletes a nested-area block, leaving the parent intact", async () => {
    if (!nestedFixture || !nestedPageId) return;
    const f = nestedFixture;

    const result = await callTool(deleteBlockTool, {
      id: nestedPageId,
      propertyAlias: f.propertyAlias,
      contentKey: NESTED_CHILD_KEY,
      culture: undefined,
      segment: undefined,
    }, extra);
    expect(result.isError).toBeFalsy();
    expect((getStructuredContent(result) as any).contentKey).toBe(NESTED_CHILD_KEY);

    const propValue = await getPropValue(nestedPageId, f.propertyAlias);
    const contentData: any[] = propValue?.contentData ?? [];
    const layout: any[] = propValue?.layout?.["Umbraco.BlockGrid"] ?? [];

    expect(contentData.some(e => e.key === NESTED_CHILD_KEY)).toBe(false);
    expect(contentData.some(e => e.key === NESTED_PARENT_KEY)).toBe(true);

    const parentLayoutItem = layout.find(e => e.contentKey === NESTED_PARENT_KEY);
    expect(parentLayoutItem).toBeDefined();

    const area = (parentLayoutItem?.areas ?? []).find((a: any) => a.key === NESTED_AREA_KEY);
    expect(area).toBeDefined();
    expect(area.items).toHaveLength(0);
  }, 60000);
});
