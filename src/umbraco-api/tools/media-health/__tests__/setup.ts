/**
 * Media Health Collection Test Setup
 *
 * Re-exports shared test utilities and provides shared state initialisation
 * for media-health integration tests. This collection uses MCP chaining — all
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
import listMediaChildrenTool from "../../media/get/list-media-children.js";

interface MediaHealthTestState {
  hasMedia: boolean;
}

/**
 * Initialise shared media-health test state.
 *
 * - Calls list-media-children to verify media exists in the instance
 * - Returns hasMedia: true if at least one media item is present
 */
export async function initMediaHealthTestState(
  extra: Parameters<typeof listMediaChildrenTool.handler>[1],
): Promise<MediaHealthTestState> {
  const result = await listMediaChildrenTool.handler(
    { parentId: undefined },
    extra,
  );

  if (result.isError) {
    return { hasMedia: false };
  }

  const data = getStructuredContent(result) as any;
  const hasMedia = Array.isArray(data?.items) && data.items.length > 0;

  return { hasMedia };
}
