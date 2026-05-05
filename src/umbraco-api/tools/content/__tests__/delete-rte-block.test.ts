/**
 * delete-block — Rich Text scenarios
 *
 * Covers the RTE-specific path where the doomed block is referenced both in
 * `propValue.markup` (as an `<umb-rte-block>` tag) and in
 * `propValue.blocks.contentData`. Verifies the markup tag is stripped and the
 * matching contentData entry is dropped.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createElicitation,
  extractChainedResult,
} from "./setup.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import deleteBlockTool from "../delete/delete-block.js";
import { createRteFixture, type RteFixture } from "./helpers/block-fixture.js";

const SEEDED_BLOCK_KEY = "11111111-1111-4111-8111-111111111111";

async function getPropValue(pageId: string, propertyAlias: string): Promise<any> {
  const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: pageId });
  const doc = extractChainedResult(docResult);
  return (doc.values ?? []).find((v: any) => v.alias === propertyAlias)?.value ?? null;
}

const elicitation = createElicitation();

describe("delete-block — Rich Text", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let fixture: RteFixture | null = null;

  beforeAll(async () => {
    fixture = await createRteFixture(extra, "_Test delete-block RTE fixture");
  }, 120000);

  beforeEach(() => {
    elicitation.reset();
  });

  afterAll(async () => {
    elicitation.cleanup();
    if (fixture) await fixture.cleanup();
  }, 60000);

  it("removes the umb-rte-block tag from markup and drops the contentData entry", async () => {
    if (!fixture) return;
    const f = fixture;

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
    expect(typeof propValue?.markup).toBe("string");
    expect(propValue.markup).not.toContain(`data-content-key="${SEEDED_BLOCK_KEY}"`);

    const contentData: any[] = propValue?.blocks?.contentData ?? [];
    expect(contentData.some(e => e.key === SEEDED_BLOCK_KEY)).toBe(false);

    const layout: any[] = propValue?.blocks?.layout?.["Umbraco.RichText"] ?? [];
    expect(layout.some(e => e.contentKey === SEEDED_BLOCK_KEY)).toBe(false);
  }, 60000);
});
