/**
 * Member Group Builder — fluent API for creating test member groups.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { MemberGroupTestHelper } from "./member-group-test-helper.js";

export class MemberGroupBuilder {
  private name: string | null = null;
  private createdId: string | null = null;

  withName(name: string): MemberGroupBuilder {
    this.name = name;
    return this;
  }

  async create(): Promise<MemberGroupBuilder> {
    if (!this.name) throw new Error("Member group must have a name. Call withName() first.");

    const result = await mcpClientManager.callTool("cms", "create-member-group", { name: this.name });
    if (result.isError) {
      const errorData = extractChainedResult(result);
      throw new Error(`Failed to create member group: ${JSON.stringify(errorData)}`);
    }

    const created = extractChainedResult(result);
    this.createdId = created?.id ?? null;

    if (!this.createdId) {
      const found = await MemberGroupTestHelper.findByName(this.name);
      if (found?.id) this.createdId = found.id;
    }

    if (!this.createdId) {
      throw new Error(`Failed to find created member group: ${this.name}`);
    }

    return this;
  }

  getId(): string {
    if (!this.createdId) throw new Error("No member group has been created yet");
    return this.createdId;
  }

  async delete(): Promise<void> {
    if (!this.createdId) throw new Error("No member group has been created yet. Cannot delete.");
    await mcpClientManager.callTool("cms", "delete-member-group", { id: this.createdId });
  }
}
