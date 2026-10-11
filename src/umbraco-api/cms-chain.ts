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
 */
export async function isCmsToolAvailable(
  toolName: CmsToolsName,
): Promise<{ ok: true; available: boolean } | { ok: false; errorResult: ReturnType<typeof createToolResultError> }> {
  try {
    const { tools } = await mcpClientManager.listTools("cms");
    return { ok: true, available: (tools ?? []).some((t) => t.name === toolName) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      errorResult: createToolResultError({
        type: "Error",
        title: "Chained tool availability check failed",
        status: 500,
        detail: `Could not determine whether chained CMS tool "${toolName}" is available: ${message}`,
      }),
    };
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
    const message = error instanceof Error ? error.message : String(error);
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
