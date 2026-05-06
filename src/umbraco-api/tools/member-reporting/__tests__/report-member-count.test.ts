import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
} from "./setup.js";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import {
  initMemberReportingTestState,
  cleanupMemberReportingTestState,
} from "./setup.js";
import reportMemberCountTool from "../get/report-member-count.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { MemberGroupBuilder } from "../../member-group/__tests__/helpers/member-group-builder.js";
import { MemberGroupTestHelper } from "../../member-group/__tests__/helpers/member-group-test-helper.js";
import { MemberTestHelper } from "../../member/__tests__/helpers/member-test-helper.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import listMemberTypesTool from "../../member/get/list-member-types.js";

describe("report-member-count", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initMemberReportingTestState(extra);
  }, 60000);

  afterAll(async () => {
    await cleanupMemberReportingTestState();
  }, 30000);

  it("should return member count breakdown by type and group", async () => {
    const result = await callTool(reportMemberCountTool, {}, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.totalMembers).toEqual(expect.any(Number));
    expect(data.byType).toBeInstanceOf(Array);
    expect(data.byGroup).toBeInstanceOf(Array);
  }, 60000);

  it("response satisfies the tool's output schema", async () => {
    const result = await callTool(reportMemberCountTool, {}, extra);
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    for (const entry of data.byType) {
      expect(typeof entry.memberType).toBe("string");
    }
  }, 60000);

  it("should return no error on normal call", async () => {
    const result = await callTool(reportMemberCountTool, {}, extra);
    expect(result.isError).toBeFalsy();
  }, 60000);

  it("regression: aggregates byGroup by group name, never by uuid", async () => {
    const ts = Date.now();
    const groupName = `_count-group-${ts}`;

    const group = await new MemberGroupBuilder().withName(groupName).create();
    const groupId = group.getId();

    // Resolve the member type for member creation
    const typeResult = await listMemberTypesTool.handler({}, extra);
    const typeData = getStructuredContent(typeResult) as any;
    const memberTypeId: string = typeData?.items?.[0]?.id;
    expect(memberTypeId).toBeDefined();

    // Create a member assigned to that group via its UUID
    const createMemberResult = await mcpClientManager.callTool("cms", "create-member", {
      email: `count-group-${ts}@example.com`,
      username: `count-group-${ts}`,
      password: "Auditpw123!",
      memberType: { id: memberTypeId },
      isApproved: true,
      variants: [{ culture: null, segment: null, name: `Count Group Member ${ts}` }],
      values: [],
      groups: [groupId],
    });
    expect(createMemberResult.isError).toBeFalsy();
    const createdMember = extractChainedResult(createMemberResult);
    const createdMemberId: string = createdMember?.id;
    expect(createdMemberId).toBeDefined();

    try {
      const result = await callTool(reportMemberCountTool, {}, extra);
      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      const byGroup: Array<{ group: string; count: number }> = data.byGroup;

      // Every row's "group" field should be a name, never a uuid
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const row of byGroup) {
        expect(row.group).not.toMatch(uuidPattern);
      }

      // The created group should appear exactly once with count >= 1
      const groupRows = byGroup.filter((r) => r.group === groupName);
      expect(groupRows).toHaveLength(1);
      expect(groupRows[0].count).toBeGreaterThanOrEqual(1);
    } finally {
      await MemberTestHelper.cleanup(createdMemberId);
      await MemberGroupTestHelper.cleanup(groupId);
    }
  }, 90000);
});
