/**
 * Content Health Collection Test Setup
 *
 * Re-exports shared test utilities and provides shared state initialisation
 * for content-health integration tests. This collection uses MCP chaining — all
 * operations go via `mcpClientManager.callTool("cms", ...)` and
 * never call the Umbraco API directly.
 */

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";

export { ContentHealthBuilder } from "./helpers/content-health-builder.js";
export { ContentHealthTestHelper } from "./helpers/content-health-test-helper.js";

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import listChildrenTool from "../../content/get/list-children.js";

export const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

interface ContentHealthTestState {
  testPageId: string;
}

let cachedState: ContentHealthTestState | null = null;

/**
 * Initialise and cache shared content-health test state.
 *
 * - Calls list-children (root) to find the first content page
 * - Caches the result so multiple test suites share the same lookup
 */
export async function initContentHealthTestState(
  extra: Parameters<typeof listChildrenTool.handler>[1],
): Promise<ContentHealthTestState> {
  if (cachedState) {
    return cachedState;
  }

  const listResult = await listChildrenTool.handler(
    { parentId: undefined },
    extra,
  );

  if (listResult.isError) {
    throw new Error(
      "Failed to list root pages: " + JSON.stringify(listResult),
    );
  }

  const listData = getStructuredContent(listResult) as any;
  if (!listData?.items?.length) {
    throw new Error("No root pages found — Umbraco instance has no content");
  }

  const testPageId: string = listData.items[0].id;
  cachedState = { testPageId };
  return cachedState;
}
