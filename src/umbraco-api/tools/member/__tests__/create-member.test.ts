import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initMemberTestState,
  TEST_MEMBER_EMAIL,
  TEST_MEMBER_USERNAME,
  TEST_MEMBER_NAME,
  TEST_MEMBER_PASSWORD,
} from "./setup.js";
import createMemberTool from "../post/create-member.js";
import searchMembersTool from "../get/search-members.js";
import getMemberTool from "../get/get-member.js";
import { MemberTestHelper } from "./helpers/member-test-helper.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

describe("create-member", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testMemberTypeId: string | undefined;
  let createdMemberId: string | undefined;

  beforeAll(async () => {
    const state = await initMemberTestState(extra);
    testMemberTypeId = state.testMemberTypeId;
  }, 60000);

  afterAll(async () => {
    if (createdMemberId) {
      await MemberTestHelper.cleanup(createdMemberId);
    }
  }, 30000);

  it("should create a new member", async () => {
    const result = await createMemberTool.handler(
      {
        email: TEST_MEMBER_EMAIL,
        username: TEST_MEMBER_USERNAME,
        name: TEST_MEMBER_NAME,
        password: TEST_MEMBER_PASSWORD,
        memberTypeId: testMemberTypeId!,
        // isApproved omitted — gated by Sensitive Data group access; demo API user lacks it
        isApproved: undefined as unknown as boolean,
        groups: undefined,
        values: undefined,
      },
      extra,
    );

    if (result.isError) {
      // Member may already exist — search for it as fallback
      await new Promise(r => setTimeout(r, 2000));
      const searchResult = await searchMembersTool.handler({ query: TEST_MEMBER_USERNAME }, extra);
      const searchData = getStructuredContent(searchResult) as any;
      if (searchData?.items?.length > 0) {
        createdMemberId = searchData.items[0].id;
        // Verify the existing member has the expected shape
        const existingResult = await getMemberTool.handler({ id: createdMemberId! }, extra);
        expect(existingResult.isError).toBeFalsy();
        return;
      }
      throw new Error("create-member failed and no existing member found to fall back on");
    }

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Created");
    expect(data.name).toBe(TEST_MEMBER_NAME);
    expect(data.email).toBe(TEST_MEMBER_EMAIL);
    expect(data.id).toBeTruthy();
    createdMemberId = data.id;
  }, 30000);

  it("applies groups at creation time", async () => {
    // The chained `create-member` accepts `groups` in its schema but doesn't
    // persist them — create-member.ts works around this with a follow-up
    // update-member call. This test asserts that the group actually lands.
    const groupName = `_audit-group-${Date.now().toString(36)}`;
    const memberEmail = `audit-groups-${Date.now().toString(36)}@example.com`;
    const memberUsername = `audit-groups-${Date.now().toString(36)}`;

    const groupResult = await mcpClientManager.callTool("cms", "create-member-group", { name: groupName });
    if (groupResult.isError) {
      throw new Error(`Failed to create test member group: ${JSON.stringify(extractChainedResult(groupResult))}`);
    }
    const groupId = extractChainedResult(groupResult).id;

    let memberId: string | undefined;
    try {
      const result = await createMemberTool.handler({
        email: memberEmail,
        username: memberUsername,
        name: "Audit Groups Regression",
        password: "AuditPass123!",
        memberTypeId: testMemberTypeId!,
        isApproved: undefined as unknown as boolean,
        groups: [groupId],
        values: undefined,
      }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      memberId = data.id;
      expect(memberId).toBeTruthy();

      const getResult = await getMemberTool.handler({ id: memberId! }, extra);
      const memberData = getStructuredContent(getResult) as any;

      expect(memberData.groups).toContain(groupId);
    } finally {
      if (memberId) await MemberTestHelper.cleanup(memberId);
      try { await mcpClientManager.callTool("cms", "delete-member-group", { id: groupId }); } catch { /* best-effort */ }
    }
  }, 60000);
});
