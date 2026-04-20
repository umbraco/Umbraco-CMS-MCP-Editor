/**
 * Member Group Collection Test Setup
 */

import { jest } from "@jest/globals";

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";
export { expectElicitationCancel } from "../../../../testing/elicitation-helpers.js";

import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";

export function createElicitation() {
  return setupEditorElicitation(jest.fn as any);
}
