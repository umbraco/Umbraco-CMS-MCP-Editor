import { describe, it, expect, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import { MemberGroupTestHelper } from "./helpers/member-group-test-helper.js";
import createMemberGroupTool from "../post/create-member-group.js";

const TEST_GROUP_NAME = "_Test Create Member Group";

describe("create-member-group", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  afterEach(async () => {
    await MemberGroupTestHelper.cleanupByName(TEST_GROUP_NAME);
  }, 30000);

  it("should create a new member group", async () => {
    // Clean up first in case it exists from a prior run
    await MemberGroupTestHelper.cleanupByName(TEST_GROUP_NAME);

    const result = await createMemberGroupTool.handler(
      { name: TEST_GROUP_NAME },
      extra,
    );

    expect(result.isError).toBeFalsy();

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Created");
    expect(data.name).toBe(TEST_GROUP_NAME);
    expect(data.id).toBeTruthy();
  }, 30000);
});
