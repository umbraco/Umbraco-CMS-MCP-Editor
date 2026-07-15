/**
 * Element Collection Test Setup
 *
 * Re-exports shared test utilities for element integration tests. This
 * collection uses MCP chaining — all element operations go via
 * `mcpClientManager.callTool("cms", ...)` and never call the Umbraco API
 * directly.
 */

import { jest } from "@jest/globals";

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";
export { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export { ElementBuilder } from "./helpers/element-builder.js";
export { ElementTestHelper } from "./helpers/element-test-helper.js";

export { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
export { expectElicitationCancel } from "../../../../testing/elicitation-helpers.js";

import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";

export function createElicitation() {
  return setupEditorElicitation(jest.fn as any);
}
