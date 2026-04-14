/**
 * Member Builder & Helper Tests
 */

import { describe, it, expect } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { MemberBuilder } from "./member-builder.js";
import { MemberTestHelper } from "./member-test-helper.js";

describe("MemberBuilder", () => {
  setupTestEnvironment();

  it("should get a member type ID", async () => {
    const id = await MemberTestHelper.getFirstMemberTypeId();
    expect(id).toBeDefined();
    expect(id!.length).toBeGreaterThan(0);
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
