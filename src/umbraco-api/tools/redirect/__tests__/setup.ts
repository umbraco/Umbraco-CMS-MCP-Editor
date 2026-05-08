/**
 * Redirect Collection Test Setup
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
import listRedirectsTool from "../get/list-redirects.js";

export const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

interface RedirectTestState {
  firstRedirectId: string | undefined;
}

let cachedState: RedirectTestState | null = null;

export async function initRedirectTestState(
  extra: Parameters<typeof listRedirectsTool.handler>[1],
): Promise<RedirectTestState> {
  if (cachedState) return cachedState;

  const result = await listRedirectsTool.handler({ filter: undefined }, extra);
  let firstRedirectId: string | undefined;
  if (!result.isError) {
    const data = getStructuredContent(result) as any;
    if (data?.items?.length > 0) {
      firstRedirectId = data.items[0].id;
    }
  }

  cachedState = { firstRedirectId };
  return cachedState;
}

export function createElicitation() {
  return setupEditorElicitation(jest.fn as any);
}
