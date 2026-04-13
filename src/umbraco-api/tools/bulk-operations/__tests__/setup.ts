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
import { mcpClientManager } from "../../../mcp-client.js";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
import listChildrenTool from "../../content/get/list-children.js";
import createPageTool from "../../content/post/create-page.js";

export const FAKE_UUID = "00000000-0000-0000-0000-000000000001";
export const FAKE_TARGET_UUID = "00000000-0000-0000-0000-000000000002";
export const FAKE_CONTENT_TYPE_KEY = "00000000-0000-0000-0000-000000000003";
export const FUTURE_DATE = "2099-01-01T09:00:00Z";

interface BulkOperationsTestState {
  /** First root page ID — used as target for most operations */
  firstRootPageId: string;
  /** Second root page ID — used as move target */
  secondRootPageId: string | undefined;
  /** If we created the second page, its ID for cleanup */
  createdSecondRootPageId: string | undefined;
}

let cachedState: BulkOperationsTestState | null = null;

/**
 * Initialise and cache shared bulk operations test state.
 *
 * - Finds root pages for bulk operations
 * - Creates a second root page if only one exists (for bulk-move)
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
  let secondRootPageId: string | undefined;
  let createdSecondRootPageId: string | undefined;

  if (browseData.items.length > 1) {
    secondRootPageId = browseData.items[1].id;
  }

  // If only one root page, create a second one for bulk-move tests
  if (!secondRootPageId) {
    try {
      const pageResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: firstRootPageId });
      if (!pageResult.isError) {
        const pageData = extractChainedResult(pageResult);
        const docTypeId = pageData?.documentType?.id;
        if (docTypeId) {
          const createResult = await createPageTool.handler(
            { name: "_Bulk Move Test Page", documentTypeId: docTypeId, parentId: undefined, values: undefined },
            extra,
          );
          if (!createResult.isError) {
            const createData = getStructuredContent(createResult) as any;
            if (createData?.id) {
              secondRootPageId = createData.id;
              createdSecondRootPageId = createData.id;
            }
          }
        }
      }
    } catch {
      console.warn("Could not create second root page — bulk-move tests may be limited");
    }
  }

  const state: BulkOperationsTestState = { firstRootPageId, secondRootPageId, createdSecondRootPageId };
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
