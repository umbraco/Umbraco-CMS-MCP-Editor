/**
 * Member Group Test Helper Tests
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { MemberGroupTestHelper } from "./member-group-test-helper.js";
import { MemberGroupBuilder } from "./member-group-builder.js";

const TEST_GROUP_NAME = "_Test MemberGroupHelper";

describe("MemberGroupTestHelper", () => {
  setupTestEnvironment();

  afterEach(async () => {
    await MemberGroupTestHelper.cleanupByName(TEST_GROUP_NAME);
  }, 30000);

  it("listGroups should return an array", async () => {
    const groups = await MemberGroupTestHelper.listGroups();
    expect(groups).toBeInstanceOf(Array);
  }, 30000);

  it("findByName should find a created group", async () => {
    await new MemberGroupBuilder()
      .withName(TEST_GROUP_NAME)
      .create();

    const found = await MemberGroupTestHelper.findByName(TEST_GROUP_NAME);
    expect(found).toBeDefined();
    expect(found!.name).toBe(TEST_GROUP_NAME);
  }, 30000);

  it("findByName should return undefined for non-existent name", async () => {
    const found = await MemberGroupTestHelper.findByName("_NonExistent 99999");
    expect(found).toBeUndefined();
  }, 30000);

  it("cleanupByName should remove a group permanently", async () => {
    await new MemberGroupBuilder()
      .withName(TEST_GROUP_NAME)
      .create();

    await MemberGroupTestHelper.cleanupByName(TEST_GROUP_NAME);

    const found = await MemberGroupTestHelper.findByName(TEST_GROUP_NAME);
    expect(found).toBeUndefined();
  }, 30000);

  it("cleanupByName should handle non-existent group gracefully", async () => {
    await MemberGroupTestHelper.cleanupByName("_NonExistent 99999");
  }, 30000);
});
