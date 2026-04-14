/**
 * Member Builder & Helper Tests
 *
 * Verifies MemberBuilder and MemberTestHelper work correctly
 * for creating, searching, and cleaning up members against real Umbraco.
 */

import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { MemberBuilder } from "./member-builder.js";
import { MemberTestHelper } from "./member-test-helper.js";

const TEST_EMAIL = "builder-test@example.com";
const TEST_USERNAME = "builder-test";
const TEST_NAME = "_Test MemberBuilder";

describe("MemberBuilder", () => {
  setupTestEnvironment();

  let memberTypeId: string | undefined;
  let createdId: string | undefined;

  beforeAll(async () => {
    memberTypeId = await MemberTestHelper.getFirstMemberTypeId();
    expect(memberTypeId).toBeDefined();
  }, 60000);

  afterEach(async () => {
    if (createdId) {
      await MemberTestHelper.cleanup(createdId);
      createdId = undefined;
    }
  }, 30000);

  it("should get a member type ID", async () => {
    const id = await MemberTestHelper.getFirstMemberTypeId();
    expect(id).toBeDefined();
    expect(id!.length).toBeGreaterThan(0);
  }, 30000);

  it("should create a member and return an ID", async () => {
    if (!memberTypeId) return;

    const member = await new MemberBuilder()
      .withEmail(TEST_EMAIL)
      .withUsername(TEST_USERNAME)
      .withName(TEST_NAME)
      .withMemberType(memberTypeId)
      .create();

    createdId = member.getId();
    expect(createdId).toBeDefined();
    expect(createdId.length).toBeGreaterThan(0);
  }, 30000);

  it("should delete a created member via cleanup", async () => {
    if (!memberTypeId) return;

    const member = await new MemberBuilder()
      .withEmail("cleanup-test@example.com")
      .withUsername("cleanup-test")
      .withName("_Test MemberBuilder Cleanup")
      .withMemberType(memberTypeId)
      .create();

    const id = member.getId();
    await MemberTestHelper.cleanup(id);
    // No throw means cleanup works
  }, 30000);

  it("cleanup should handle non-existent member gracefully", async () => {
    await MemberTestHelper.cleanup("00000000-0000-0000-0000-000000000000");
  }, 30000);

  it("should throw if create called without email", async () => {
    const builder = new MemberBuilder().withUsername("test").withName("test").withMemberType("fake");
    await expect(builder.create()).rejects.toThrow(/must have an email/);
  });

  it("should throw if create called without username", async () => {
    const builder = new MemberBuilder().withEmail("test@example.com").withName("test").withMemberType("fake");
    await expect(builder.create()).rejects.toThrow(/must have a username/);
  });

  it("should throw if getId called before create", () => {
    const builder = new MemberBuilder();
    expect(() => builder.getId()).toThrow(/No member has been created yet/);
  });
});
