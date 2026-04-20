/**
 * Media Health Test Helper — static utility for finding media items to audit.
 * All tools in this collection are read-only.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export class MediaHealthTestHelper {
  /** Find root media items */
  static async listRootMedia(take = 10): Promise<any[]> {
    const cursor = btoa(JSON.stringify({ s: 0, t: take }));
    const result = await mcpClientManager.callTool("cms", "get-media-root", { cursor });
    if (result.isError) return [];
    const data = extractChainedResult(result);
    return data?.items ?? [];
  }
}
