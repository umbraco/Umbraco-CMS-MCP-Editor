/**
 * Member Reporting Builder Tests
 *
 * Verifies that MemberReportingGroupBuilder and MemberReportingTestHelper
 * work correctly via chained CMS tools against a real Umbraco instance.
 */

import { jest, describe, it, expect, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
} from "@umbraco-cms/mcp-server-sdk/testing";
import { setupEditorElicitation } from "../../../../../testing/setup-elicitation.js";
import { MemberReportingGroupBuilder } from "./member-reporting-builder.js";
import { MemberReportingTestHelper } from "./member-reporting-test-helper.js";

const TEST_GROUP_NAME = "_Test MR Builder Group";

const elicitation = setupEditorElicitation(jest.fn as any);

describe("MemberReportingGroupBuilder", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  const createdIds: string[] = [];

  afterAll(async () => {
    for (const id of createdIds) {
      await MemberReportingTestHelper.cleanup(id);
    }
    elicitation.cleanup();
  }, 30000);

  it("should create a member group and return its id", async () => {
    const builder = await new MemberReportingGroupBuilder()
      .withGroupName(TEST_GROUP_NAME)
      .create(extra);

    const id = builder.getId();
    expect(id).toBeDefined();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
    createdIds.push(id);
  }, 30000);

  it("should throw if getId called before create", () => {
    const builder = new MemberReportingGroupBuilder().withGroupName(TEST_GROUP_NAME);
    expect(() => builder.getId()).toThrow(/not created yet/);
  });

  it("should return the group name set via withGroupName", () => {
    const builder = new MemberReportingGroupBuilder().withGroupName("Custom Name");
    expect(builder.getGroupName()).toBe("Custom Name");
  });

  it("should delete a created group", async () => {
    const builder = await new MemberReportingGroupBuilder()
      .withGroupName(`${TEST_GROUP_NAME} Delete`)
      .create(extra);

    const id = builder.getId();
    await builder.delete();

    // After delete, getId should throw because createdId is cleared
    expect(() => builder.getId()).toThrow(/not created yet/);
  }, 30000);
});

describe("MemberReportingTestHelper", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  it("should return a group name when groups exist (or null when none)", async () => {
    const name = await MemberReportingTestHelper.getGroupName(extra);
    // May be null or a string — just verify type
    expect(name === null || typeof name === "string").toBe(true);
  }, 30000);

  it("should ensureMemberGroupExists without error", async () => {
    const { createdGroupId } = await MemberReportingTestHelper.ensureMemberGroupExists(extra);
    // Clean up if we created one
    if (createdGroupId) {
      await MemberReportingTestHelper.cleanup(createdGroupId);
    }
    // Passes as long as no error is thrown
    expect(true).toBe(true);
  }, 30000);
});
