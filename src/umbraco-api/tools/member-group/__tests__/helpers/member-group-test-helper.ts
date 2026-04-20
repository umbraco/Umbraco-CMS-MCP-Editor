/**
 * Member Group Test Helper
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export class MemberGroupTestHelper {
  /** List all member groups */
  static async listGroups(): Promise<any[]> {
    const result = await mcpClientManager.callTool("cms", "get-member-group-root", {});
    if (result.isError) return [];
    const data = extractChainedResult(result);
    return data?.items ?? [];
  }

  /** Delete a member group by ID */
  static async cleanup(id: string): Promise<void> {
    try {
      await mcpClientManager.callTool("cms", "delete-member-group", { id });
    } catch {
      // Best-effort
    }
  }

  /** Find a member group by name */
  static async findByName(name: string): Promise<any | undefined> {
    const groups = await this.listGroups();
    return groups.find((g: any) => g.name === name);
  }

  /** Delete a member group by name */
  static async cleanupByName(name: string): Promise<void> {
    const group = await this.findByName(name);
    if (group?.id) {
      await this.cleanup(group.id);
    }
  }
}
