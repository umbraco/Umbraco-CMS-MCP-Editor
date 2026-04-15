/**
 * Member Reporting Test Helper — static utility class for test data setup
 * and cleanup for the member-reporting collection.
 *
 * Uses MCP chaining (not direct API calls).
 */

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { mcpClientManager } from "../../../../mcp-client.js";
import listMemberGroupsTool from "../../../member-group/get/list-member-groups.js";
import createMemberGroupTool from "../../../member-group/post/create-member-group.js";

type Extra = Parameters<typeof listMemberGroupsTool.handler>[1];

export class MemberReportingTestHelper {
  /**
   * Ensure at least one member group exists for report-members-by-group tests.
   * Returns the ID of the group that was created (null if one already existed).
   */
  static async ensureMemberGroupExists(extra: Extra): Promise<{ createdGroupId: string | null }> {
    const groupsResult = await listMemberGroupsTool.handler({}, extra);
    const groupsData = getStructuredContent(groupsResult) as any;

    if (groupsData?.items?.length) {
      return { createdGroupId: null };
    }

    // No groups exist — create one for testing
    const createResult = await createMemberGroupTool.handler(
      { name: "_Test Reporting Group" },
      extra,
    );
    if (createResult.isError) {
      return { createdGroupId: null };
    }
    const createData = getStructuredContent(createResult) as any;
    return { createdGroupId: createData?.id ?? null };
  }

  /**
   * Delete the member group created by ensureMemberGroupExists.
   * Silently ignores errors (best-effort cleanup).
   */
  static async cleanup(createdGroupId: string | null): Promise<void> {
    if (!createdGroupId) return;
    try {
      await mcpClientManager.callTool("cms", "delete-member-group", { id: createdGroupId });
    } catch {
      // Best-effort cleanup
    }
  }

  /**
   * Return the first member group's name, or null if no groups exist.
   */
  static async getGroupName(extra: Extra): Promise<string | null> {
    const groupsResult = await listMemberGroupsTool.handler({}, extra);
    const groupsData = getStructuredContent(groupsResult) as any;
    if (!groupsData?.items?.length) return null;
    return groupsData.items[0].name ?? null;
  }
}
