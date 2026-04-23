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
import updateMemberTool from "../put/update-member.js";

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

    if (result.isError) {
      console.error("update-member 'isTwoFactorEnabled' failed:", JSON.stringify(result, null, 2));
    }
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.message).toContain("Updated");
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
});
