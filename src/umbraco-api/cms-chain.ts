import type { CmsTools, CmsToolsName } from "@umbraco-cms/mcp-dev/tool-types";
import { createToolResultError, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "./mcp-client.js";

type CmsChainResult<TName extends CmsToolsName> =
  | { ok: true; data: CmsTools[TName]["output"] }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

/**
 * Pull the ProblemDetails-shaped payload out of a chained `CallToolResult`
 * error envelope.
 *
 * As of `@umbraco-cms/mcp-server-sdk` beta.43, `createToolResultError` no
 * longer sets `structuredContent` on error results at all (intentionally —
 * see its JSDoc and https://github.com/umbraco/Umbraco-MCP-Base/issues/343:
 * some MCP clients validate `structuredContent` against the tool's
 * outputSchema even on `isError` results, discarding the real error). So the
 * `content[0].text` JSON-parse path below is now the normal path, not just a
 * compat-mode fallback; the `structuredContent` check only still matters for
 * chained tools running an older SDK. Synthesize a minimal ProblemDetails if
 * neither is present — callers always receive a stable shape.
 *
 * Exported so other internal consumers that need to inspect a tool result's
 * ProblemDetails before reshaping it into their own response — e.g.
 * `bulk-handler.ts`'s `parseBulkError` — can reuse the same extraction
 * instead of duplicating it.
 */
export function extractInnerProblemDetails(result: Record<string, unknown>): Record<string, unknown> {
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
        // Not JSON — a plain human-readable string (createToolResultError
        // supports passing one directly, e.g. rename-page.ts). Surface it
        // rather than discarding it for a generic message.
        return {
          type: "Error",
          title: "Chained tool error",
          status: 500,
          detail: `Chained CMS tool returned a non-JSON error: ${text}`,
        };
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

/**
 * An in-process "Tool not found" error lists every available tool (370+ names)
 * after ". Available tools", which is useless noise once it reaches the model
 * (and the Workers log, via the `console.warn` in `chainCms` below) — keep
 * only the leading sentence that names the missing tool. Gated on both
 * markers being present (not just ". Available tools") so an unrelated
 * thrown error that happens to contain that substring passes through
 * untouched instead of silently losing its real content.
 */
function truncateAvailableTools(message: string): string {
  const availableToolsIndex = message.indexOf(". Available tools");
  if (availableToolsIndex === -1 || !message.includes("Tool not found:")) {
    return message;
  }
  return message.slice(0, availableToolsIndex + 1);
}

/**
 * Check whether a chained CMS tool is currently registered on the connected
 * Umbraco instance. Some CMS tools are gated at runtime by `isUmbracoAtLeast`
 * checks the chained server makes against the live instance's reported
 * version (e.g. `create-and-publish-document` / `update-and-publish-document`,
 * only registered from Umbraco 17.6 — see `cms-tool-types-augment.d.ts`), so
 * the same tool name can be callable against one site and "Tool not found"
 * against another. Checked fresh on every call rather than memoized: cheap
 * today, and once the upstream gating issue is fixed the answer becomes a
 * per-site constant rather than a process-wide one, so caching it now would
 * just be a stale-cache bug waiting to happen.
 *
 * If the availability check itself can't be completed (e.g. `listTools`
 * throws), we can't tell one way or the other — treat the tool as available
 * rather than blocking the call on a probe failure. The subsequent
 * `chainCms(toolName, ...)` call has its own try/catch and will surface the
 * real underlying failure (e.g. "tool not found", or whatever the actual
 * connectivity problem is) through its normal `{ ok: false, errorResult }`
 * contract, which is more specific than anything this probe could report.
 */
export async function isCmsToolAvailable(toolName: CmsToolsName): Promise<boolean> {
  try {
    const { tools } = await mcpClientManager.listTools("cms");
    return (tools ?? []).some((t) => t.name === toolName);
  } catch {
    return true;
  }
}

export async function chainCms<TName extends CmsToolsName>(
  toolName: TName,
  args: CmsTools[TName]["input"],
): Promise<CmsChainResult<TName>> {
  let result: Record<string, unknown>;
  try {
    result = await mcpClientManager.callTool("cms", toolName, args as Record<string, unknown>);
  } catch (error) {
    // A malformed response from the chained CMS tool (e.g. its own output failing
    // its own schema check) surfaces as a thrown protocol-level McpError from the
    // underlying client, not a resolved isError result — normalize it to the same
    // { ok: false, errorResult } contract so callers never need a try/catch here.
    const message = truncateAvailableTools(error instanceof Error ? error.message : String(error));
    console.warn(`Chained CMS tool "${toolName}" failed: ${message}`);
    return {
      ok: false,
      errorResult: createToolResultError({
        type: "Error",
        title: "Chained tool call failed",
        status: 500,
        detail: `Chained CMS tool "${toolName}" failed: ${message}`,
      }),
    };
  }
  if (result.isError) {
    const inner = extractInnerProblemDetails(result);
    return { ok: false, errorResult: createToolResultError(inner) };
  }
  return { ok: true, data: extractChainedResult(result) as CmsTools[TName]["output"] };
}
