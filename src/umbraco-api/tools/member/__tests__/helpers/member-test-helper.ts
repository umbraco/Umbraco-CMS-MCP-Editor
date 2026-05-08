/**
 * Member Test Helper — static utility for finding and cleaning up members.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export class MemberTestHelper {
  /** Search for a member by query */
  static async searchMembers(query: string): Promise<any[]> {
    const result = await mcpClientManager.callTool("cms", "find-member", { query });
    if (result.isError) return [];
    const data = extractChainedResult(result);
    return data?.items ?? [];
  }

  /** Delete a member by ID (permanent) */
  static async cleanup(id: string): Promise<void> {
    try {
      await mcpClientManager.callTool("cms", "delete-member", { id });
    } catch {
      // Best-effort
    }
  }

  /** Get first member type ID */
  static async getFirstMemberTypeId(): Promise<string | undefined> {
    const result = await mcpClientManager.callTool("cms", "get-member-type-root", {
      cursor: btoa(JSON.stringify({ s: 0, t: 5 })),
    });
    if (result.isError) return undefined;
    const data = extractChainedResult(result);
    return data?.items?.[0]?.id;
  }
}
