/**
 * Dictionary Collection Test Setup
 *
 * Re-exports shared test utilities and provides shared state initialisation
 * for dictionary integration tests. Uses MCP chaining for all operations.
 */

import { jest } from "@jest/globals";

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";

export { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export { DictionaryBuilder } from "./helpers/dictionary-builder.js";
export { DictionaryTestHelper } from "./helpers/dictionary-test-helper.js";

export { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
export { expectElicitationCancel } from "../../../../testing/elicitation-helpers.js";

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
import listDictionaryTool from "../get/list-dictionary.js";

export const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";
export const DEFAULT_ISO_CODE = "en-US";

interface DictionaryTestState {
  /** ID of an existing dictionary item (if any exist) */
  existingItemId: string | undefined;
}

let cachedState: DictionaryTestState | null = null;

/**
 * Initialise and cache shared dictionary test state.
 *
 * - Lists root dictionary items to find an existing item for read tests
 * - Caches the result so multiple test suites share the same lookup
 */
export async function initDictionaryTestState(
  extra: Parameters<typeof listDictionaryTool.handler>[1],
): Promise<DictionaryTestState> {
  if (cachedState) {
    return cachedState;
  }

  const result = await listDictionaryTool.handler({ parentId: undefined }, extra);
  if (result.isError) {
    throw new Error("Failed to list dictionary items: " + JSON.stringify(result));
  }

  const data = getStructuredContent(result) as any;
  const existingItemId = data?.items?.length > 0 ? data.items[0].id : undefined;

  const state: DictionaryTestState = { existingItemId };
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
