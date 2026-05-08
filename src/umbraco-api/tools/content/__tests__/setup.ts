/**
 * Content Collection Test Setup
 *
 * Re-exports shared test utilities and provides shared state initialisation
 * for content integration tests. This collection uses MCP chaining — all
 * content operations go via `mcpClientManager.callTool("cms", ...)` and
 * never call the Umbraco API directly.
 */

import { jest } from "@jest/globals";

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";

export { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export { ContentBuilder } from "./helpers/content-builder.js";
export { ContentTestHelper } from "./helpers/content-test-helper.js";

export { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
export { expectElicitationCancel } from "../../../../testing/elicitation-helpers.js";

import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { mcpClientManager } from "../../../mcp-client.js";
import { ContentTestHelper } from "./helpers/content-test-helper.js";
import listChildrenTool from "../get/list-children.js";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";

export const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

interface ContentTestState {
  testPageId: string;
  testDocumentTypeId: string;
}

let cachedState: ContentTestState | null = null;

/**
 * Initialise and cache shared content test state.
 *
 * - Finds the first root page using the list-children editor tool
 * - Resolves a document type ID from children (or falls back to the root page itself)
 * - Caches the result so multiple test suites share the same lookup
 */
export async function initContentTestState(
  extra: Parameters<typeof listChildrenTool.handler>[1],
): Promise<ContentTestState> {
  if (cachedState) {
    return cachedState;
  }

  const rootResult = await listChildrenTool.handler({ parentId: undefined }, extra);
  if (rootResult.isError) {
    throw new Error("Failed to list root pages: " + JSON.stringify(rootResult));
  }

  const rootData = getStructuredContent(rootResult) as any;
  if (!rootData?.items?.length) {
    throw new Error("No root pages found — Umbraco instance has no content");
  }

  const testPageId: string = rootData.items[0].id;
  let testDocumentTypeId: string | undefined;

  // Prefer a doc type from an existing child (known to be allowed under the parent)
  const children = await ContentTestHelper.getChildren(testPageId, 5);
  for (const child of children) {
    const childResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: child.id });
    if (!childResult.isError) {
      const childDoc = extractChainedResult(childResult);
      if (childDoc?.documentType?.id) {
        testDocumentTypeId = childDoc.documentType.id;
        break;
      }
    }
  }

  // Fall back to the root page's own document type
  if (!testDocumentTypeId) {
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: testPageId });
    if (docResult.isError) {
      throw new Error("Failed to get root page document type");
    }
    const doc = extractChainedResult(docResult);
    if (!doc?.documentType?.id) {
      throw new Error("Root page has no document type ID");
    }
    testDocumentTypeId = doc.documentType.id;
  }

  const state: ContentTestState = { testPageId, testDocumentTypeId: testDocumentTypeId as string };
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
