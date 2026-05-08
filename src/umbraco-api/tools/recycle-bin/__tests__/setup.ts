/**
 * Recycle Bin Collection Test Setup
 *
 * Re-exports shared test utilities for recycle-bin integration tests. This
 * collection works across both content and media recycle bins via chained
 * CMS tools — tests use MediaManagementBuilder for tree setup then move items
 * to the bin via deleteMediaTool so the fixtures mirror real-world flows.
 */

import { jest } from "@jest/globals";

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export { RecycleBinBuilder } from "./helpers/recycle-bin-builder.js";
export { RecycleBinTestHelper } from "./helpers/recycle-bin-test-helper.js";

export { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
export { expectElicitationCancel } from "../../../../testing/elicitation-helpers.js";

import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";

/**
 * Create a fresh elicitation mock for a test suite.
 * Call this at the top level of a describe block.
 */
export function createElicitation() {
  return setupEditorElicitation(jest.fn as any);
}
