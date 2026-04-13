/**
 * Media Management Collection Test Setup
 */

import { jest } from "@jest/globals";

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";
export { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export { MediaManagementBuilder } from "./helpers/media-management-builder.js";
export { MediaManagementTestHelper } from "./helpers/media-management-test-helper.js";

export { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
export { expectElicitationCancel } from "../../../../testing/elicitation-helpers.js";

import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";

export function createElicitation() {
  return setupEditorElicitation(jest.fn as any);
}
