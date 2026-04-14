/**
 * Member Reporting Test Helper Tests
 */

import { describe, it, expect } from "@jest/globals";
import { setupTestEnvironment, createMockRequestHandlerExtra } from "@umbraco-cms/mcp-server-sdk/testing";
import { MemberReportingTestHelper } from "./member-reporting-test-helper.js";

describe("MemberReportingTestHelper", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  it("ensureMemberGroupExists should return without error", async () => {
    const result = await MemberReportingTestHelper.ensureMemberGroupExists(extra);
    expect(result).toBeDefined();
    expect(result).toHaveProperty("createdGroupId");

    // Clean up if we created one
    if (result.createdGroupId) {
      await MemberReportingTestHelper.cleanup(result.createdGroupId);
    }
  }, 30000);

  it("getGroupName should return a string or null", async () => {
    const name = await MemberReportingTestHelper.getGroupName(extra);
    if (name !== null) {
      expect(typeof name).toBe("string");
    }
  }, 30000);

  it("cleanup should handle null gracefully", async () => {
    await MemberReportingTestHelper.cleanup(null);
  });
});
