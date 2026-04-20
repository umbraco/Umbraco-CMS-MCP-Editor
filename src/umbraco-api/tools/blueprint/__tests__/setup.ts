/**
 * Blueprint Collection Test Setup
 *
 * Re-exports shared test utilities and provides shared state initialisation
 * for blueprint integration tests. Uses MCP chaining for all operations.
 */

import { jest } from "@jest/globals";

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";

export { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export { BlueprintBuilder } from "./helpers/blueprint-builder.js";
export { BlueprintTestHelper } from "./helpers/blueprint-test-helper.js";

export { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
export { expectElicitationCancel } from "../../../../testing/elicitation-helpers.js";

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
import listChildrenTool from "../../content/get/list-children.js";

export const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

interface BlueprintTestState {
  /** A valid page ID that can be used as a blueprint source */
  testPageId: string;
}

let cachedState: BlueprintTestState | null = null;

/**
 * Initialise and cache shared blueprint test state.
 *
 * - Finds the first root page to use as a source for creating blueprints
 * - Caches the result so multiple test suites share the same lookup
 */
export async function initBlueprintTestState(
  extra: Parameters<typeof listChildrenTool.handler>[1],
): Promise<BlueprintTestState> {
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

  const state: BlueprintTestState = { testPageId };
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
