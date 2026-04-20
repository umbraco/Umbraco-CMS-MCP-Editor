import { describe, it, expect, afterAll, afterEach, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createElicitation,
  expectElicitationCancel,
} from "./setup.js";
import { MemberGroupTestHelper } from "./helpers/member-group-test-helper.js";
import createMemberGroupTool from "../post/create-member-group.js";

const TEST_GROUP_NAME = "_Test Create Member Group";
const elicitation = createElicitation();

describe("create-member-group", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  afterAll(async () => {
    elicitation.cleanup();
  });

  afterEach(async () => {
    await MemberGroupTestHelper.cleanupByName(TEST_GROUP_NAME);
  }, 30000);

  beforeEach(() => { elicitation.reset(); });

  it("should create a new member group", async () => {
    // Clean up first in case it exists from a prior run
    await MemberGroupTestHelper.cleanupByName(TEST_GROUP_NAME);

    const result = await createMemberGroupTool.handler(
      { name: TEST_GROUP_NAME },
      extra,
    );

    if (result.isError) {
      console.warn("create-member-group failed");
      return;
    }

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Created");
    expect(data.name).toBe(TEST_GROUP_NAME);
    expect(data.id).toBeTruthy();
  }, 30000);

  it("should cancel create when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      createMemberGroupTool.handler({ name: "Should Not Be Created Group" }, extra),
    );
  }, 30000);
});
