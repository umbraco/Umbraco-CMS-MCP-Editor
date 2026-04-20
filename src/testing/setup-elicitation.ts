/**
 * Elicitation test setup helper.
 *
 * Sets up the server ref with a mock server that delegates elicitInput
 * to the jest mock from setupElicitationMock. This is required because
 * our editor tools call confirmAction() which needs a server reference.
 *
 * Usage in tests:
 *   import { setupEditorElicitation } from "../../../testing/setup-elicitation.js";
 *   const elicitation = setupEditorElicitation(jest.fn as any);
 */

import { setServerRef, clearServerRef } from "@umbraco-cms/mcp-server-sdk";
import { setupElicitationMock } from "@umbraco-cms/mcp-server-sdk/testing";

export function setupEditorElicitation(jestFn: any) {
  const elicitation = setupElicitationMock(jestFn);

  // Create a mock server with elicitInput that delegates to the jest mock
  const mockServer = {
    elicitInput: elicitation.mock,
  };

  // Set the server ref so confirmAction() can find it
  setServerRef(mockServer as any);

  return {
    ...elicitation,
    cleanup: () => {
      clearServerRef();
    },
  };
}
