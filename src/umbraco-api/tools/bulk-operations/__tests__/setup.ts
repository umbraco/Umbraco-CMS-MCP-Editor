/**
 * Bulk Operations Collection Test Setup
 *
 * Re-exports shared test utilities and provides shared state initialisation
 * for bulk operations integration tests. Uses MCP chaining for all operations.
 */

import { jest } from "@jest/globals";

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";

export { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export { BulkOperationsTestHelper } from "./helpers/bulk-operations-test-helper.js";

export { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
export { expectElicitationCancel } from "../../../../testing/elicitation-helpers.js";

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
import { mcpClientManager } from "../../../mcp-client.js";
import listChildrenTool from "../../content/get/list-children.js";

export const FAKE_UUID = "00000000-0000-0000-0000-000000000001";
export const FAKE_TARGET_UUID = "00000000-0000-0000-0000-000000000002";
export const FAKE_CONTENT_TYPE_KEY = "00000000-0000-0000-0000-000000000003";
export const FUTURE_DATE = "2099-01-01T09:00:00Z";

interface BulkOperationsTestState {
  /** First root page ID — used as target for most operations */
  firstRootPageId: string;
  /** Second root page ID — used as move target */
  secondRootPageId: string | undefined;
  /** Blog page ID */
  blogPageId: string;
  /** Blog document type ID (for creating blog containers) */
  blogDocTypeId: string;
  /** Article document type ID (for creating articles under blogs) */
  articleDocTypeId: string;
  /**
   * Property values copied from an existing seed article. Use these when
   * creating an article in a test that needs to publish — articles have
   * required fields (articleDate, author, etc.) that must be set or the
   * publish API rejects the document with `ContentInvalid`.
   */
  articleSeedValues: Array<{ alias: string; value: unknown; culture: string | null; segment: string | null }>;
}

let cachedState: BulkOperationsTestState | null = null;

/**
 * Initialise and cache shared bulk operations test state.
 *
 * - Finds root pages for bulk operations
 * - Discovers Blog page, blog doc type, and article doc type from starter kit
 * - Caches the result so multiple test suites share the same lookup
 */
export async function initBulkOperationsTestState(
  extra: Parameters<typeof listChildrenTool.handler>[1],
): Promise<BulkOperationsTestState> {
  if (cachedState) {
    return cachedState;
  }

  const browseResult = await listChildrenTool.handler({ parentId: undefined }, extra);
  if (browseResult.isError) {
    throw new Error("Failed to list root pages: " + JSON.stringify(browseResult));
  }

  const browseData = getStructuredContent(browseResult) as any;
  if (!browseData?.items?.length) {
    throw new Error("No root pages found — Umbraco instance has no content");
  }

  const firstRootPageId: string = browseData.items[0].id;
  const secondRootPageId: string | undefined = browseData.items.length > 1
    ? browseData.items[1].id
    : undefined;

  // Find Blog page under the first root page
  const children = getStructuredContent(
    await listChildrenTool.handler({ parentId: firstRootPageId }, extra),
  ) as any;
  const blogItem = children.items?.find((i: any) => i.name === "Blog");
  if (!blogItem) throw new Error("No Blog page found in starter kit");

  const blogDoc = extractChainedResult(
    await mcpClientManager.callTool("cms", "get-document-by-id", { id: blogItem.id }),
  );

  // Get article doc type from first blog child
  const blogChildren = getStructuredContent(
    await listChildrenTool.handler({ parentId: blogItem.id }, extra),
  ) as any;
  if (!blogChildren.items?.length) throw new Error("No articles found under Blog");
  const articleDoc = extractChainedResult(
    await mcpClientManager.callTool("cms", "get-document-by-id", { id: blogChildren.items[0].id }),
  );

  const articleSeedValues = (articleDoc.values ?? []).map((v: any) => ({
    alias: v.alias,
    value: v.value,
    culture: v.culture ?? null,
    segment: v.segment ?? null,
  }));

  const state: BulkOperationsTestState = {
    firstRootPageId,
    secondRootPageId,
    blogPageId: blogItem.id,
    blogDocTypeId: blogDoc.documentType.id,
    articleDocTypeId: articleDoc.documentType.id,
    articleSeedValues,
  };
  cachedState = state;
  return state;
}

/**
 * Create a fresh elicitation mock for a test suite.
 * Call this at the top level of a describe block.
 */
export function createElicitation() {
  return setupEditorElicitation(jest.fn as any);
}
