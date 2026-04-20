/**
 * Relationships Collection Test Setup
 *
 * Re-exports shared test utilities and provides shared state initialisation
 * for relationships integration tests. This collection uses MCP chaining — all
 * operations go via `mcpClientManager.callTool("cms", ...)` and
 * never call the Umbraco API directly.
 */

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import listChildrenTool from "../../content/get/list-children.js";
import listMediaChildrenTool from "../../media/get/list-media-children.js";

export const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

interface RelationshipsTestState {
  testPageId: string;
  testMediaId: string | null;
}

let cachedState: RelationshipsTestState | null = null;

/**
 * Initialise and cache shared relationships test state.
 *
 * - Finds the first root page using the list-children editor tool
 * - Finds the first root media item using the list-media-children editor tool
 * - Caches the result so multiple test suites share the same lookup
 */
export async function initRelationshipsTestState(
  extra: Parameters<typeof listChildrenTool.handler>[1],
): Promise<RelationshipsTestState> {
  if (cachedState) {
    return cachedState;
  }

  const [pageResult, mediaResult] = await Promise.all([
    listChildrenTool.handler({ parentId: undefined }, extra),
    listMediaChildrenTool.handler({ parentId: undefined }, extra),
  ]);

  if (pageResult.isError) {
    throw new Error("Failed to list root pages: " + JSON.stringify(pageResult));
  }

  const pageData = getStructuredContent(pageResult) as any;
  if (!pageData?.items?.length) {
    throw new Error("No root pages found — Umbraco instance has no content");
  }

  const testPageId: string = pageData.items[0].id;

  let testMediaId: string | null = null;
  if (!mediaResult.isError) {
    const mediaData = getStructuredContent(mediaResult) as any;
    if (mediaData?.items?.length > 0) {
      testMediaId = mediaData.items[0].id;
    }
  }

  const state: RelationshipsTestState = { testPageId, testMediaId };
  cachedState = state;
  return state;
}
