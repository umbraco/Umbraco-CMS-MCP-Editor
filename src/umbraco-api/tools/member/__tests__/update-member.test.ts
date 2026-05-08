import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initMemberTestState,
  createElicitation,
  TEST_MEMBER_UPDATED_NAME,
} from "./setup.js";
import { MemberBuilder } from "./helpers/member-builder.js";
import { MemberTestHelper } from "./helpers/member-test-helper.js";
import { MemberGroupBuilder } from "../../member-group/__tests__/helpers/member-group-builder.js";
import { MemberGroupTestHelper } from "../../member-group/__tests__/helpers/member-group-test-helper.js";
import updateMemberTool from "../put/update-member.js";
import getMemberTool from "../get/get-member.js";
import createMemberTool from "../post/create-member.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

const elicitation = createElicitation();

describe("update-member", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let memberId: string;

  beforeAll(async () => {
    const state = await initMemberTestState(extra);
    expect(state.testMemberTypeId).toBeDefined();

    const member = await new MemberBuilder()
      .withEmail("update-test@example.com")
      .withUsername("update-test")
      .withName("_Test Update Member")
      .withMemberType(state.testMemberTypeId!)
      .create();
    memberId = member.getId();
  }, 60000);

  afterAll(async () => {
    if (memberId) await MemberTestHelper.cleanup(memberId);
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => { elicitation.reset(); });

  it("should update a member", async () => {
    const result = await updateMemberTool.handler(
      {
        id: memberId,
        name: TEST_MEMBER_UPDATED_NAME,
        email: undefined,
        username: undefined,
        newPassword: undefined,
        isTwoFactorEnabled: undefined,
        isApproved: undefined,
        isLockedOut: undefined,
        groups: undefined,
        values: undefined,
      },
      extra,
    );

    if (result.isError) {
      console.error("update-member 'should update a member' failed:", JSON.stringify(result, null, 2));
    }
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Updated");
    expect(data.id).toBe(memberId);
  }, 30000);

  it("should update the member's username", async () => {
    const result = await updateMemberTool.handler(
      {
        id: memberId,
        name: undefined,
        email: undefined,
        username: "update-test-renamed",
        newPassword: undefined,
        isTwoFactorEnabled: undefined,
        isApproved: undefined,
        isLockedOut: undefined,
        groups: undefined,
        values: undefined,
      },
      extra,
    );

    if (result.isError) {
      console.error("update-member 'username' failed:", JSON.stringify(result, null, 2));
    }
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.message).toContain("Updated");
  }, 30000);

  it("should toggle isTwoFactorEnabled", async () => {
    const result = await updateMemberTool.handler(
      {
        id: memberId,
        name: undefined,
        email: undefined,
        username: undefined,
        newPassword: undefined,
        isTwoFactorEnabled: true,
        isApproved: undefined,
        isLockedOut: undefined,
        groups: undefined,
        values: undefined,
      },
      extra,
    );

    // isTwoFactorEnabled is gated by Umbraco's Sensitive Data group. The demo
    // API user used in the test environment isn't in that group, so the tool
    // returns 403 with an explanatory message rather than silently failing.
    // Once the API user is granted access, this test should assert success.
    expect(result.isError).toBeTruthy();
    const data = (result as any).structuredContent;
    expect(data.status).toBe(403);
    expect(data.title).toContain("Sensitive Data");
  }, 30000);

  it("should reset password when elicitation accepts (confirmed path)", async () => {
    // Default acceptAll means the password-reset confirmation will be accepted.
    const result = await updateMemberTool.handler(
      {
        id: memberId,
        name: undefined,
        email: undefined,
        username: undefined,
        newPassword: "NewPassword123!",
        isTwoFactorEnabled: undefined,
        isApproved: undefined,
        isLockedOut: undefined,
        groups: undefined,
        values: undefined,
      },
      extra,
    );

    if (result.isError) {
      console.error("update-member 'password confirmed' failed:", JSON.stringify(result, null, 2));
    }
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.message).toContain("password changed");
    expect(elicitation.mock).toHaveBeenCalled();
  }, 30000);

  it("should skip password reset when the confirmation is declined", async () => {
    // Decline the password-reset confirmation; the rest of the update still runs.
    elicitation.rejectAll();

    const result = await updateMemberTool.handler(
      {
        id: memberId,
        name: undefined,
        email: undefined,
        username: undefined,
        newPassword: "ShouldNotApply456!",
        isTwoFactorEnabled: undefined,
        isApproved: undefined,
        isLockedOut: undefined,
        groups: undefined,
        values: undefined,
      },
      extra,
    );

    if (result.isError) {
      console.error("update-member 'password declined' failed:", JSON.stringify(result, null, 2));
    }
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.message).toContain("password reset cancelled");
    expect(data.message).not.toContain("password changed");
    expect(elicitation.mock).toHaveBeenCalled();
  }, 30000);

  it("preserves existing group memberships when groups is not in the payload", async () => {
    const state = await initMemberTestState(extra);
    const ts = Date.now();

    const group = await new MemberGroupBuilder()
      .withName(`_preserve-groups-test-${ts}`)
      .create();
    const groupId = group.getId();

    const createResult = await createMemberTool.handler(
      {
        email: `preserve-${ts}@example.com`,
        username: `preserve-${ts}`,
        name: "Preserve Groups Member",
        password: "Auditpw123!",
        memberTypeId: state.testMemberTypeId!,
        isApproved: undefined as unknown as boolean,
        groups: [groupId],
        values: undefined,
      },
      extra,
    );
    expect(createResult.isError).toBeFalsy();
    const createData = getStructuredContent(createResult) as any;
    const newMemberId: string = createData.id;

    try {
      // Update name only — intentionally omit `groups`
      const updateResult = await callTool(
        updateMemberTool,
        {
          id: newMemberId,
          name: "Renamed Member",
          email: undefined,
          username: undefined,
          newPassword: undefined,
          isTwoFactorEnabled: undefined,
          isApproved: undefined,
          isLockedOut: undefined,
          groups: undefined,
          values: undefined,
        },
        extra,
      );

      if (updateResult.isError) {
        console.error("preserve-groups update failed:", JSON.stringify(updateResult, null, 2));
      }
      expect(updateResult.isError).toBeFalsy();

      // Read back and assert the group membership survived
      const getResult = await getMemberTool.handler({ id: newMemberId }, extra);
      expect(getResult.isError).toBeFalsy();
      const memberData = getStructuredContent(getResult) as any;
      expect(memberData.groups).toContain(groupId);
    } finally {
      await MemberTestHelper.cleanup(newMemberId);
      await MemberGroupTestHelper.cleanup(groupId);
    }
  }, 60000);
});
