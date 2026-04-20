import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initMemberTestState,
  createElicitation,
  expectElicitationCancel,
  TEST_MEMBER_PASSWORD,
} from "./setup.js";
import createMemberTool from "../post/create-member.js";
import deleteMemberTool from "../delete/delete-member.js";
import searchMembersTool from "../get/search-members.js";

const elicitation = createElicitation();

describe("delete-member", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testMemberTypeId: string | undefined;

  beforeAll(async () => {
    const state = await initMemberTestState(extra);
    testMemberTypeId = state.testMemberTypeId;
  }, 60000);

  afterAll(() => { elicitation.cleanup(); });
  beforeEach(() => { elicitation.reset(); });

  it("should delete a member", async () => {

    // Create a member to delete
    const createResult = await createMemberTool.handler(
      {
        email: "delete-test@example.com",
        username: "delete-test",
        name: "_Test Delete Member",
        password: TEST_MEMBER_PASSWORD,
        memberTypeId: testMemberTypeId!,
        isApproved: true,
        groups: undefined,
        values: undefined,
      },
      extra,
    );
    elicitation.reset();

    let memberId: string | undefined;
    if (!createResult.isError) {
      const data = getStructuredContent(createResult) as any;
      memberId = data?.id;
    }
    if (!memberId) {
      await new Promise(r => setTimeout(r, 2000));
      const searchResult = await searchMembersTool.handler({ query: "delete-test" }, extra);
      const searchData = getStructuredContent(searchResult) as any;
      if (searchData?.items?.length > 0) memberId = searchData.items[0].id;
    }

    const result = await deleteMemberTool.handler({ id: memberId! }, extra);

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Permanently deleted");
    expect(data.id).toBe(memberId);
  }, 30000);

  it("should cancel delete when elicitation is rejected", async () => {
    // Find any member to test rejection
    let targetMemberId: string | undefined;
    const searchResult = await searchMembersTool.handler({ query: "test" }, extra);
    const searchData = getStructuredContent(searchResult) as any;
    if (searchData?.items?.length > 0) {
      targetMemberId = searchData.items[0].id;
    }

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      deleteMemberTool.handler({ id: targetMemberId! }, extra),
    );
  }, 30000);
});
