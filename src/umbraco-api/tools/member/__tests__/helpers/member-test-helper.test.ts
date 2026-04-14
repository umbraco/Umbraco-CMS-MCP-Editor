/**
 * Member Test Helper Tests
 */

import { describe, it, expect } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { MemberTestHelper } from "./member-test-helper.js";

describe("MemberTestHelper", () => {
  setupTestEnvironment();

  it("getFirstMemberTypeId should return a valid ID", async () => {
    const id = await MemberTestHelper.getFirstMemberTypeId();
    expect(id).toBeDefined();
    expect(id!.length).toBeGreaterThan(0);
  }, 30000);

  it("searchMembers should return an array", async () => {
    const items = await MemberTestHelper.searchMembers("admin");
    expect(items).toBeInstanceOf(Array);
  }, 30000);

  it("cleanup should handle non-existent member gracefully", async () => {
    await MemberTestHelper.cleanup("00000000-0000-0000-0000-000000000000");
  }, 30000);
});
