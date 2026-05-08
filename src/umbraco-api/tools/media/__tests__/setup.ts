/**
 * Media Collection Test Setup
 *
 * Re-exports shared test utilities and provides shared state initialisation
 * for media integration tests. This collection uses MCP chaining — all
 * media operations go via `mcpClientManager.callTool("cms", ...)` and
 * never call the Umbraco API directly.
 */

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";

export { MediaBuilder } from "./helpers/media-builder.js";
export { MediaTestHelper } from "./helpers/media-test-helper.js";

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import listMediaChildrenTool from "../get/list-media-children.js";

interface MediaTestState {
  testMediaId: string;
}

let cachedState: MediaTestState | null = null;

/**
 * Initialise and cache shared media test state.
 *
 * - Calls list-media-children at root to get top-level media items
 * - Extracts the first item's ID for use in get-media tests
 * - Caches the result so multiple test suites share the same lookup
 */
export async function initMediaTestState(
  extra: Parameters<typeof listMediaChildrenTool.handler>[1],
): Promise<MediaTestState> {
  if (cachedState) {
    return cachedState;
  }

  const result = await listMediaChildrenTool.handler(
    { parentId: undefined },
    extra,
  );
  if (result.isError) {
    throw new Error("Failed to list media children: " + JSON.stringify(result));
  }

  const data = getStructuredContent(result) as any;
  if (!data?.items?.length) {
    throw new Error("No media items found at root — cannot initialise media test state");
  }

  const state: MediaTestState = { testMediaId: data.items[0].id };
  cachedState = state;
  return state;
}
