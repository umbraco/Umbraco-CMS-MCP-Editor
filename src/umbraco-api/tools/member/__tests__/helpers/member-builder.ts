/**
 * Member Builder — fluent API for creating test members via chained CMS tools.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export class MemberBuilder {
  private email: string | null = null;
  private username: string | null = null;
  private name: string | null = null;
  private password = "TestPass123!";
  private memberTypeId: string | null = null;
  private isApproved = true;
  private createdId: string | null = null;

  withEmail(email: string): MemberBuilder {
    this.email = email;
    return this;
  }

  withUsername(username: string): MemberBuilder {
    this.username = username;
    return this;
  }

  withName(name: string): MemberBuilder {
    this.name = name;
    return this;
  }

  withPassword(password: string): MemberBuilder {
    this.password = password;
    return this;
  }

  withMemberType(memberTypeId: string): MemberBuilder {
    this.memberTypeId = memberTypeId;
    return this;
  }

  async create(): Promise<MemberBuilder> {
    if (!this.email) throw new Error("Member must have an email. Call withEmail() first.");
    if (!this.username) throw new Error("Member must have a username. Call withUsername() first.");
    if (!this.name) throw new Error("Member must have a name. Call withName() first.");
    if (!this.memberTypeId) throw new Error("Member must have a member type. Call withMemberType() first.");

    const result = await mcpClientManager.callTool("cms", "create-member", {
      email: this.email,
      username: this.username,
      name: this.name,
      password: this.password,
      memberTypeId: this.memberTypeId,
      isApproved: this.isApproved,
    });

    if (result.isError) {
      const errorData = extractChainedResult(result);
      throw new Error(`Failed to create member: ${JSON.stringify(errorData)}`);
    }

    const created = extractChainedResult(result);
    this.createdId = created?.id ?? null;

    if (!this.createdId) {
      throw new Error(`Failed to get ID for created member: ${this.email}`);
    }

    return this;
  }

  getId(): string {
    if (!this.createdId) throw new Error("No member has been created yet");
    return this.createdId;
  }

  async delete(): Promise<void> {
    if (!this.createdId) throw new Error("No member has been created yet. Cannot delete.");
    await mcpClientManager.callTool("cms", "delete-member", { id: this.createdId });
  }
}
