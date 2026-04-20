import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initMemberTestState,
  createElicitation,
  expectElicitationCancel,
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
        isApproved: undefined,
        isLockedOut: undefined,
        groups: undefined,
        values: undefined,
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Updated");
    expect(data.id).toBe(memberId);
  }, 30000);

  it("should cancel update when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      updateMemberTool.handler(
        {
          id: memberId,
          name: "Should Not Change",
          email: undefined,
          isApproved: undefined,
          isLockedOut: undefined,
          groups: undefined,
          values: undefined,
        },
        extra,
      ),
    );
  }, 30000);
});
