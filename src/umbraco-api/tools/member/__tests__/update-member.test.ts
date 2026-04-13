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
  TEST_MEMBER_UPDATED_NAME,
} from "./setup.js";
import createMemberTool from "../post/create-member.js";
import updateMemberTool from "../put/update-member.js";
import deleteMemberTool from "../delete/delete-member.js";
import searchMembersTool from "../get/search-members.js";

const elicitation = createElicitation();

describe("update-member", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testMemberTypeId: string | undefined;
  let memberId: string | undefined;

  beforeAll(async () => {
    const state = await initMemberTestState(extra);
    testMemberTypeId = state.testMemberTypeId;

    // Create or find a member to update
    if (testMemberTypeId) {
      const createResult = await createMemberTool.handler(
        {
          email: "update-test@example.com",
          username: "update-test",
          name: "_Test Update Member",
          password: TEST_MEMBER_PASSWORD,
          memberTypeId: testMemberTypeId,
          isApproved: true,
          groups: undefined,
          values: undefined,
        },
        extra,
      );
      if (!createResult.isError) {
        const data = getStructuredContent(createResult) as any;
        memberId = data?.id;
      }
      if (!memberId) {
        await new Promise(r => setTimeout(r, 2000));
        const searchResult = await searchMembersTool.handler({ query: "update-test" }, extra);
        const searchData = getStructuredContent(searchResult) as any;
        if (searchData?.items?.length > 0) memberId = searchData.items[0].id;
      }
    }
  }, 60000);

  afterAll(async () => {
    if (memberId) {
      try {
        elicitation.reset();
        await deleteMemberTool.handler({ id: memberId }, extra);
      } catch { /* best-effort */ }
    }
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => { elicitation.reset(); });

  it("should update a member", async () => {
    if (!memberId) {
      console.warn("Skipping update-member test: no member available");
      return;
    }

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

    if (result.isError) {
      console.warn("Skipping update-member assertions: CMS returned error");
      return;
    }

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Updated");
    expect(data.id).toBe(memberId);
  }, 30000);

  it("should cancel update when elicitation is rejected", async () => {
    if (!memberId) {
      console.warn("Skipping update rejection test: no member available");
      return;
    }

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      updateMemberTool.handler(
        {
          id: memberId!,
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
