import type { CmsTools, CmsToolsName } from "@umbraco-cms/mcp-dev/tool-types";
import { createToolResultError, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "./mcp-client.js";

type CmsChainResult<TName extends CmsToolsName> =
  | { ok: true; data: CmsTools[TName]["output"] }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

export async function chainCms<TName extends CmsToolsName>(
  toolName: TName,
  args: CmsTools[TName]["input"],
): Promise<CmsChainResult<TName>> {
  const result = await mcpClientManager.callTool("cms", toolName, args as Record<string, unknown>);
  if (result.isError) return { ok: false, errorResult: createToolResultError(result) };
  return { ok: true, data: extractChainedResult(result) as CmsTools[TName]["output"] };
}
