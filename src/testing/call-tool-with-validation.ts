/**
 * Test helper that runs a tool's response through its declared outputSchema —
 * matches what the live MCP transport does at the wire boundary.
 *
 * Tests call `tool.handler(args, extra)` directly, which bypasses the MCP
 * transport's output-schema validation (that only fires when the response is
 * serialised onto the JSON-RPC wire). A handler can return a value that
 * doesn't satisfy its outputSchema, pass every integration test, and still
 * fail with -32602 against a real MCP client. Routing every call through
 * `callTool` closes that gap — one zod parse, no extra round-trip, immediate
 * test failure on shape drift.
 *
 * Usage:
 *
 *   import { callTool } from "../../../../testing/call-tool-with-validation.js";
 *   const result = await callTool(myTool, { id }, extra);
 *
 * The helper is intentionally typed loosely — matching the SDK's ToolDefinition
 * generics (CursorPaginatedArgs, ZodObject vs ZodTypeAny, etc.) adds friction
 * without value. The runtime parse is what matters.
 */

// Loose typing on purpose — see the file-level comment.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function callTool(tool: any, args: any, extra: any): Promise<any> {
  const result = await tool.handler(args, extra);

  // Skip schema validation for error results — error responses use a different
  // problem-details shape that doesn't satisfy the tool's success-path schema.
  if (result.isError) return result;

  if (tool.outputSchema && result.structuredContent !== undefined) {
    const parsed = tool.outputSchema.safeParse(result.structuredContent);
    if (!parsed.success) {
      const issues = parsed.error.issues
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((i: any) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(
        `Tool "${tool.name}" returned a response that doesn't satisfy its outputSchema. ` +
          `This would fail at the MCP transport layer with a -32602 error live. Issues:\n${issues}`,
      );
    }
  }

  return result;
}
