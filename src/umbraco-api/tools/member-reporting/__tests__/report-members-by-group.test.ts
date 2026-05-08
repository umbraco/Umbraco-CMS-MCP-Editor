import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  MemberReportingTestHelper,
} from "./setup.js";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import {
  initMemberReportingTestState,
  cleanupMemberReportingTestState,
} from "./setup.js";
import reportMembersByGroupTool from "../get/report-members-by-group.js";
import { MemberGroupBuilder } from "../../member-group/__tests__/helpers/member-group-builder.js";
import { MemberGroupTestHelper } from "../../member-group/__tests__/helpers/member-group-test-helper.js";
import { MemberTestHelper } from "../../member/__tests__/helpers/member-test-helper.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import listMemberTypesTool from "../../member/get/list-member-types.js";

describe("report-members-by-group", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initMemberReportingTestState(extra);
  }, 60000);

  afterAll(async () => {
    await cleanupMemberReportingTestState();
  }, 30000);

  it("should return members for an existing group", async () => {
    const groupName = await MemberReportingTestHelper.getGroupName(extra);

    const result = await reportMembersByGroupTool.handler({ groupName: groupName! }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.groupName).toEqual(expect.any(String));
    expect(data.items).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));
  }, 60000);

  it("regression: returns members assigned to group (filters by id, not name)", async () => {
    const ts = Date.now();
    const groupName = `_test-group-by-id-${ts}`;

    const group = await new MemberGroupBuilder().withName(groupName).create();
    const groupId = group.getId();

    // Resolve the member type for member creation
    const typeResult = await listMemberTypesTool.handler({}, extra);
    const typeData = getStructuredContent(typeResult) as any;
    const memberTypeId: string = typeData?.items?.[0]?.id;
    expect(memberTypeId).toBeDefined();

    // Create a member with that group id
    const createMemberResult = await mcpClientManager.callTool("cms", "create-member", {
      email: `group-filter-${ts}@example.com`,
      username: `group-filter-${ts}`,
      password: "Auditpw123!",
      memberType: { id: memberTypeId },
      isApproved: true,
      variants: [{ culture: null, segment: null, name: `Group Filter Member ${ts}` }],
      values: [],
      groups: [groupId],
    });
    expect(createMemberResult.isError).toBeFalsy();
    const createdMember = extractChainedResult(createMemberResult);
    const createdMemberId: string = createdMember?.id;
    expect(createdMemberId).toBeDefined();

    try {
      const result = await callTool(reportMembersByGroupTool, { groupName }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.items).toBeInstanceOf(Array);
      expect(data.items.some((m: any) => m.id === createdMemberId)).toBe(true);
      expect(data.total).toBeGreaterThanOrEqual(1);
    } finally {
      await MemberTestHelper.cleanup(createdMemberId);
      await MemberGroupTestHelper.cleanup(groupId);
    }
  }, 90000);
});
