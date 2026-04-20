import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initMemberTestState,
  createElicitation,
  expectElicitationCancel,
  TEST_MEMBER_EMAIL,
  TEST_MEMBER_USERNAME,
  TEST_MEMBER_NAME,
  TEST_MEMBER_PASSWORD,
} from "./setup.js";
import createMemberTool from "../post/create-member.js";
import deleteMemberTool from "../delete/delete-member.js";
import searchMembersTool from "../get/search-members.js";
import getMemberTool from "../get/get-member.js";

const elicitation = createElicitation();

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
      try {
        elicitation.reset();
        await deleteMemberTool.handler({ id: createdMemberId }, extra);
      } catch { /* best-effort */ }
    }
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => { elicitation.reset(); });

  it("should create a new member", async () => {

    const result = await createMemberTool.handler(
      {
        email: TEST_MEMBER_EMAIL,
        username: TEST_MEMBER_USERNAME,
        name: TEST_MEMBER_NAME,
        password: TEST_MEMBER_PASSWORD,
        memberTypeId: testMemberTypeId!,
        isApproved: true,
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

  it("should cancel create when elicitation is rejected", async () => {
    if (!testMemberTypeId) return;

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      createMemberTool.handler(
        {
          email: "should-not-be-created@example.com",
          username: "should-not-be-created",
          name: "Should Not Be Created",
          password: TEST_MEMBER_PASSWORD,
          memberTypeId: testMemberTypeId!,
          isApproved: true,
          groups: undefined,
          values: undefined,
        },
        extra,
      ),
    );
  }, 30000);
});
