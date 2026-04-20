/**
 * Member Group Builder & Helper Tests
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { MemberGroupBuilder } from "./member-group-builder.js";
import { MemberGroupTestHelper } from "./member-group-test-helper.js";

const TEST_GROUP_NAME = "_Test MemberGroupBuilder";

describe("MemberGroupBuilder", () => {
  setupTestEnvironment();

  afterEach(async () => {
    await MemberGroupTestHelper.cleanupByName(TEST_GROUP_NAME);
  }, 30000);

  it("should create a member group and return an ID", async () => {
    const group = await new MemberGroupBuilder()
      .withName(TEST_GROUP_NAME)
      .create();

    expect(group.getId()).toBeDefined();
    expect(group.getId().length).toBeGreaterThan(0);
  }, 30000);

  it("should find a created group by name", async () => {
    await new MemberGroupBuilder()
      .withName(TEST_GROUP_NAME)
      .create();

    const found = await MemberGroupTestHelper.findByName(TEST_GROUP_NAME);
    expect(found).toBeDefined();
    expect(found!.name).toBe(TEST_GROUP_NAME);
  }, 30000);

  it("should delete a created group", async () => {
    const group = await new MemberGroupBuilder()
      .withName(TEST_GROUP_NAME)
      .create();

    await group.delete();

    const found = await MemberGroupTestHelper.findByName(TEST_GROUP_NAME);
    expect(found).toBeUndefined();
  }, 30000);

  it("should throw if create called without name", async () => {
    const builder = new MemberGroupBuilder();
    await expect(builder.create()).rejects.toThrow(/must have a name/);
  });

  it("cleanup should handle non-existent group gracefully", async () => {
    await MemberGroupTestHelper.cleanupByName("_NonExistent Group 99999");
  }, 30000);
});
