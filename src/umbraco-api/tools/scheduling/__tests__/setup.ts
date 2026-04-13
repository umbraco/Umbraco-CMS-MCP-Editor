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
