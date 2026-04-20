/**
 * Scheduling Collection Test Setup
 */

import { jest } from "@jest/globals";

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";

export { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
export { expectElicitationCancel } from "../../../../testing/elicitation-helpers.js";

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
import listChildrenTool from "../../content/get/list-children.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

interface SchedulingTestState {
  testPageId: string;
}

let cachedState: SchedulingTestState | null = null;

export async function initSchedulingTestState(
  extra: Parameters<typeof listChildrenTool.handler>[1],
): Promise<SchedulingTestState> {
  if (cachedState) return cachedState;

  const result = await listChildrenTool.handler({ parentId: undefined }, extra);
  if (result.isError) throw new Error("Failed to list root pages");

  const data = getStructuredContent(result) as any;
  if (!data?.items?.length) throw new Error("No root pages found");

  cachedState = { testPageId: data.items[0].id };
  return cachedState;
}

export function createElicitation() {
  return setupEditorElicitation(jest.fn as any);
}

/** Check if a document is fully published (all variants published). */
function isPublished(doc: any): boolean {
  const variants = doc?.variants ?? [];
  return variants.length > 0 && variants.every((v: any) => v.state === "Published");
}

/** Publish the document if it's currently draft. */
async function ensurePublished(id: string): Promise<void> {
  const doc = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
  if (doc.isError) return;
  const data = extractChainedResult(doc);
  if (isPublished(data)) return;

  await mcpClientManager.callTool("cms", "publish-document", {
    id,
    data: { publishSchedules: [{ culture: null }] },
  });
}

/**
 * Find a root page (auto-publishing it if draft) and a document type allowed
 * beneath it. Returns null if no suitable parent+type can be discovered.
 */
export async function findSchedulingParentAndType(): Promise<{ parentId: string; documentTypeId: string } | null> {
  const rootResult = await mcpClientManager.callTool("cms", "get-document-root", {
    cursor: btoa(JSON.stringify({ s: 0, t: 20 })),
  });
  if (rootResult.isError) return null;
  const roots = extractChainedResult(rootResult)?.items ?? [];
  if (!roots.length) return null;

  const root = roots[0];
  await ensurePublished(root.id);

  const rootDoc = await mcpClientManager.callTool("cms", "get-document-by-id", { id: root.id });
  if (rootDoc.isError) return null;
  const rootDocData = extractChainedResult(rootDoc);

  // Prefer a child's document type (guaranteed allowed beneath this parent)
  const childrenResult = await mcpClientManager.callTool("cms", "get-document-children", {
    parentId: root.id,
    cursor: btoa(JSON.stringify({ s: 0, t: 5 })),
  });
  if (!childrenResult.isError) {
    const children = extractChainedResult(childrenResult)?.items ?? [];
    if (children.length > 0) {
      const childDoc = await mcpClientManager.callTool("cms", "get-document-by-id", { id: children[0].id });
      if (!childDoc.isError) {
        const doc = extractChainedResult(childDoc);
        if (doc?.documentType?.id) {
          return { parentId: root.id, documentTypeId: doc.documentType.id };
        }
      }
    }
  }

  if (rootDocData?.documentType?.id) {
    return { parentId: root.id, documentTypeId: rootDocData.documentType.id };
  }
  return null;
}
