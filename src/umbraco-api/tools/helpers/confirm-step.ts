import { getServerRef } from "@umbraco-cms/mcp-server-sdk";

/**
 * Single-step confirmation for tool actions that need user approval before
 * proceeding (destructive or otherwise).
 *
 * Sends an empty-schema elicitation so the host renders the message with
 * just Accept / Decline buttons — no checkbox to tick before confirming.
 *
 * The SDK's `confirmAction` includes a `confirm: boolean` field that the
 * host renders as a checkbox alongside Accept / Decline, forcing a
 * two-step interaction. For tools where Accept already means "go ahead",
 * the checkbox is friction without added safety.
 *
 * Returns `true` only when the user clicks Accept.
 */
export async function confirmStep(
  extra: { requestId?: string | number } | undefined,
  message: string,
): Promise<boolean> {
  const server = getServerRef();
  const result = await server.elicitInput(
    {
      message,
      requestedSchema: {
        type: "object",
        properties: {},
      },
    },
    { relatedRequestId: extra?.requestId },
  );
  return result.action === "accept";
}
