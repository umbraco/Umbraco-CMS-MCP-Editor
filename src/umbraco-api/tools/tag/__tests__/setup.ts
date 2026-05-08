/**
 * Tag Collection Test Setup
 *
 * Re-exports shared test utilities and provides shared state initialisation
 * for tag integration tests. This collection uses MCP chaining — all
 * tag operations go via `mcpClientManager.callTool("cms", ...)` and
 * never call the Umbraco API directly.
 */

import { jest } from "@jest/globals";

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import listTagsTool from "../get/list-tags.js";

interface TagTestState {
  existingTagGroup: string | null;
}

let cachedState: TagTestState | null = null;

/**
 * Initialise and cache shared tag test state.
 *
 * - Calls list-tags with no filter to get all tags
 * - Finds the first tag's group if any exist. Null when the instance has
 *   no tagged content — the group-filter test is explicitly skipped in
 *   that case (not silently returned) since the starter kit doesn't seed
 *   any tags.
 * - Caches the result so multiple test suites share the same lookup
 */
export async function initTagTestState(
  extra: Parameters<typeof listTagsTool.handler>[1],
): Promise<TagTestState> {
  if (cachedState) {
    return cachedState;
  }

  const result = await listTagsTool.handler({ tagGroup: undefined }, extra);
  if (result.isError) {
    throw new Error("Failed to list tags: " + JSON.stringify(result));
  }

  const data = getStructuredContent(result) as any;
  const existingTagGroup: string | null = data?.items?.[0]?.group ?? null;

  const state: TagTestState = { existingTagGroup };
  cachedState = state;
  return state;
}
