/**
 * Elicitation test setup helper.
 *
 * Sets up a mock server whose `elicitInput` simulates how a real MCP host
 * (Claude Code etc.) responds: when the user accepts, the host returns the
 * schema's `default` for any fields the user didn't modify.
 *
 * That distinction matters: SDK's `setupElicitationMock` always returns
 * `{ action: "accept", content: { confirm: true } }` regardless of the
 * requested schema — so tests pass even when a tool sends a schema whose
 * default would actually cause the host to cancel the action. This helper
 * mirrors host behaviour, so a misset default fails the test.
 *
 * Usage:
 *   const elicitation = setupEditorElicitation(jest.fn);
 *   elicitation.acceptAll();   // default — accept with schema defaults
 *   elicitation.rejectAll();   // user clicked Decline
 */

import { setServerRef, clearServerRef } from "@umbraco-cms/mcp-server-sdk";

interface ElicitationRequest {
  message?: string;
  requestedSchema?: {
    type?: string;
    properties?: Record<string, { default?: unknown }>;
  };
}

function defaultsFromSchema(request: ElicitationRequest): Record<string, unknown> {
  const properties = request?.requestedSchema?.properties ?? {};
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(properties)) {
    if (prop && prop.default !== undefined) out[key] = prop.default;
  }
  return out;
}

export function setupEditorElicitation(jestFn: any) {
  const mock: any = jestFn();

  const acceptAll = () => {
    mock.mockImplementation(async (request: ElicitationRequest) => ({
      action: "accept",
      content: defaultsFromSchema(request),
    }));
  };

  const rejectAll = () => {
    mock.mockImplementation(async () => ({
      action: "decline",
      content: {},
    }));
  };

  const reset = () => {
    mock.mockReset();
    acceptAll();
  };

  acceptAll();

  setServerRef({ elicitInput: mock } as any);

  return {
    mock,
    acceptAll,
    rejectAll,
    reset,
    cleanup: () => clearServerRef(),
  };
}
