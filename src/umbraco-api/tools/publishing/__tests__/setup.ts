/**
 * Publishing Collection Test Setup
 */

import { jest } from "@jest/globals";

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";
export { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
export { expectElicitationCancel } from "../../../../testing/elicitation-helpers.js";

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
import listChildrenTool from "../../content/get/list-children.js";
import { mcpClientManager } from "../../../mcp-client.js";

export const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

interface PublishingTestState {
  testPageId: string;
}

let cachedState: PublishingTestState | null = null;

export async function initPublishingTestState(
  extra: Parameters<typeof listChildrenTool.handler>[1],
): Promise<PublishingTestState> {
  if (cachedState) return cachedState;

  const result = await listChildrenTool.handler({ parentId: undefined }, extra);
  if (result.isError) throw new Error("Failed to list root pages");

  const data = getStructuredContent(result) as any;
  if (!data?.items?.length) throw new Error("No root pages found");

  const testPageId: string = data.items[0].id;

  // Ensure the root page is published — eval scenarios sometimes leave it
  // unpublished, which then breaks integration publishes that need a
  // published parent. Idempotent: a no-op if already live.
  await mcpClientManager.callTool("cms", "publish-document", {
    id: testPageId,
    data: { publishSchedules: [{ culture: null }] },
  }).catch(() => {});

  cachedState = { testPageId };
  return cachedState;
}

export function createElicitation() {
  return setupEditorElicitation(jest.fn as any);
}
