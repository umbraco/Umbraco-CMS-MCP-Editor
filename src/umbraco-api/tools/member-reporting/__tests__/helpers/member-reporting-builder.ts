/**
 * Member Reporting Builder — fluent builder for creating member groups
 * used as test prerequisites for member-reporting tests.
 *
 * Usage:
 *   const builder = await new MemberReportingGroupBuilder()
 *     .withGroupName("_Test Group")
 *     .create(extra);
 *
 *   const id = builder.getId();
 *   await builder.delete();
 */

import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { mcpClientManager } from "../../../../mcp-client.js";
import createMemberGroupTool from "../../../member-group/post/create-member-group.js";

type Extra = Parameters<typeof createMemberGroupTool.handler>[1];

const TEST_GROUP_NAME = "_Test Reporting Group";

export class MemberReportingGroupBuilder {
  private groupName: string = TEST_GROUP_NAME;
  private createdId: string | null = null;

  withGroupName(name: string): this {
    this.groupName = name;
    return this;
  }

  async create(extra: Extra): Promise<this> {
    const result = await createMemberGroupTool.handler({ name: this.groupName }, extra);
    if (result.isError) {
      throw new Error(`Failed to create member group "${this.groupName}"`);
    }
    const data = getStructuredContent(result) as any;
    const id = data?.id;
    if (!id) {
      throw new Error(`Member group "${this.groupName}" was created but no ID was returned`);
    }
    this.createdId = id;
    return this;
  }

  getId(): string {
    if (!this.createdId) {
      throw new Error("Member group not created yet. Call create() first.");
    }
    return this.createdId;
  }

  getGroupName(): string {
    return this.groupName;
  }

  async delete(): Promise<void> {
    if (!this.createdId) return;
    try {
      await mcpClientManager.callTool("cms", "delete-member-group", { id: this.createdId });
    } catch {
      // Best-effort cleanup
    }
    this.createdId = null;
  }
}
