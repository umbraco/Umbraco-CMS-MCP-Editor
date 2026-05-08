/**
 * Elicitation test helpers for integration tests.
 *
 * Provides a concise helper for testing that write operations are properly
 * cancelled when the user rejects the elicitation confirmation.
 *
 * Usage:
 *   import { expectElicitationCancel } from "../../testing/elicitation-helpers.js";
 *
 *   it("should cancel when rejected", async () => {
 *     if (!cmsAvailable) return;
 *     elicitation.rejectAll();
 *     await expectElicitationCancel(
 *       () => createPageTool.handler({ name: "test", ... }, extra),
 *     );
 *   });
 */

import { expect } from "@jest/globals";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";

/**
 * Assert that a tool call is cancelled (via elicitation rejection or CMS error).
 * Tools may error before reaching elicitation (e.g. invalid input), or cancel
 * via the elicitation flow — both are acceptable outcomes.
 */
export async function expectElicitationCancel(
  toolCall: () => any,
): Promise<void> {
  const result = await Promise.resolve(toolCall());
  const data = getStructuredContent(result) as any;
  const isCancelled = data?.message?.toLowerCase().includes("cancelled");
  const isError = result.isError;
  expect(isCancelled || isError).toBe(true);
}
