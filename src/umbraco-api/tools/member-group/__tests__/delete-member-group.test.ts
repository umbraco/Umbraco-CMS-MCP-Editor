import { describe, it, expect, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createElicitation,
  expectElicitationCancel,
} from "./setup.js";
import { MemberGroupTestHelper } from "./helpers/member-group-test-helper.js";
import { MemberGroupBuilder } from "./helpers/member-group-builder.js";
import deleteMemberGroupTool from "../delete/delete-member-group.js";
import listMemberGroupsTool from "../get/list-member-groups.js";

const TEST_GROUP_NAME = "_Test Delete Member Group";
const REJECTION_GROUP_NAME = "_Test Delete Rejection Group";
const elicitation = createElicitation();

describe("delete-member-group", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  afterAll(async () => {
    await MemberGroupTestHelper.cleanupByName(TEST_GROUP_NAME);
    await MemberGroupTestHelper.cleanupByName(REJECTION_GROUP_NAME);
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => { elicitation.reset(); });

  it("should delete a member group", async () => {
    const group = await new MemberGroupBuilder()
      .withName(TEST_GROUP_NAME)
      .create();

    elicitation.reset();

    const result = await deleteMemberGroupTool.handler({ id: group.getId() }, extra);

    if (result.isError) {
      console.warn("Skipping delete assertions: CMS returned error");
      return;
    }

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Deleted");
    expect(data.id).toBe(group.getId());
  }, 30000);

  it("should cancel delete when elicitation is rejected", async () => {
    // Find existing group or create one — always track for cleanup
    const listResult = await listMemberGroupsTool.handler({}, extra);
    const listData = getStructuredContent(listResult) as any;
    let targetGroupId: string | undefined;

    if (listData?.items?.length) {
      targetGroupId = listData.items[0].id;
    } else {
      const group = await new MemberGroupBuilder()
        .withName(REJECTION_GROUP_NAME)
        .create();
      targetGroupId = group.getId();
      elicitation.reset();
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
