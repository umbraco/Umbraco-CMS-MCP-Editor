import type { CmsTools, CmsToolsName } from "@umbraco-cms/mcp-dev/tool-types";
import { createToolResultError, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "./mcp-client.js";

type CmsChainResult<TName extends CmsToolsName> =
  | { ok: true; data: CmsTools[TName]["output"] }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

/**
 * Pull the ProblemDetails-shaped payload out of a chained `CallToolResult`
 * error envelope. The SDK's `createToolResultError(problemDetails)` puts the
 * details directly under `structuredContent`, so we just take that. If the
 * caller chose compat mode (no structuredContent) we fall back to JSON-parsing
 * `content[0].text`. Synthesize a minimal ProblemDetails if neither is present
 * — callers always receive a stable shape.
 */
function extractInnerProblemDetails(result: Record<string, unknown>): Record<string, unknown> {
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent as Record<string, unknown>;
  }
  const content = result.content;
  if (Array.isArray(content)) {
    const text = content.find((c): c is { type?: string; text?: string } =>
      typeof c === "object" && c !== null && (c as { type?: string }).type === "text"
    )?.text;
    if (typeof text === "string" && text.length > 0) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object") {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Fall through to synthesized default.
      }
    }
  }
  return {
    type: "Error",
    title: "Chained tool error",
    status: 500,
    detail: "Chained CMS tool returned an error with no structured details.",
  };
}

export async function chainCms<TName extends CmsToolsName>(
  toolName: TName,
  args: CmsTools[TName]["input"],
): Promise<CmsChainResult<TName>> {
  const result = await mcpClientManager.callTool("cms", toolName, args as Record<string, unknown>);
  if (result.isError) {
    const inner = extractInnerProblemDetails(result as Record<string, unknown>);
    return { ok: false, errorResult: createToolResultError(inner) };
  }
  return { ok: true, data: extractChainedResult(result) as CmsTools[TName]["output"] };
}
