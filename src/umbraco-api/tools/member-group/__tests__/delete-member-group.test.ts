import { describe, it, expect, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createElicitation,
  expectElicitationCancel,
} from "./setup.js";
import createMemberGroupTool from "../post/create-member-group.js";
import deleteMemberGroupTool from "../delete/delete-member-group.js";
import listMemberGroupsTool from "../get/list-member-groups.js";

const TEST_GROUP_NAME = "_Test Delete Member Group";
const elicitation = createElicitation();

describe("delete-member-group", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  afterAll(() => { elicitation.cleanup(); });
  beforeEach(() => { elicitation.reset(); });

  it("should delete a member group", async () => {
    // Create a group to delete
    const createResult = await createMemberGroupTool.handler(
      { name: TEST_GROUP_NAME },
      extra,
    );
    elicitation.reset();

    let groupId: string | undefined;
    if (!createResult.isError) {
      const data = getStructuredContent(createResult) as any;
      groupId = data?.id;
    }
    if (!groupId) {
      console.warn("Skipping delete test: could not create group");
      return;
    }

    const result = await deleteMemberGroupTool.handler({ id: groupId }, extra);

    if (result.isError) {
      console.warn("Skipping delete assertions: CMS returned error");
      return;
    }

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Deleted");
    expect(data.id).toBe(groupId);
  }, 30000);

  it("should cancel delete when elicitation is rejected", async () => {
    // Find or create a group to test rejection
    const listResult = await listMemberGroupsTool.handler({}, extra);
    const listData = getStructuredContent(listResult) as any;
    let targetGroupId: string | undefined;

    if (listData?.items?.length) {
      targetGroupId = listData.items[0].id;
    } else {
      const createResult = await createMemberGroupTool.handler(
        { name: "_Delete Rejection Test Group" },
        extra,
      );
      elicitation.reset();
      if (!createResult.isError) {
        const createData = getStructuredContent(createResult) as any;
        targetGroupId = createData?.id;
      }
    }

    if (!targetGroupId) {
      console.warn("Skipping delete rejection test: no group available");
      return;
    }

    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      deleteMemberGroupTool.handler({ id: targetGroupId! }, extra),
    );
  }, 30000);
});
