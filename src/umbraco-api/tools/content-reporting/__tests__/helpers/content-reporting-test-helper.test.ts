/**
 * Content Reporting Test Helper Tests
 */

import { describe, it, expect } from "@jest/globals";
import { setupTestEnvironment, createMockRequestHandlerExtra } from "@umbraco-cms/mcp-server-sdk/testing";
import { ContentReportingTestHelper } from "./content-reporting-test-helper.js";

describe("ContentReportingTestHelper", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  it("verifyConnectivity should not throw for a working CMS", async () => {
    await ContentReportingTestHelper.verifyConnectivity(extra);
  }, 30000);

  it("normalizeIds should replace UUIDs with placeholder", () => {
    const input = { id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890", name: "test" };
    const result = ContentReportingTestHelper.normalizeIds(input) as any;
    expect(result.id).toBe("00000000-0000-0000-0000-000000000000");
    expect(result.name).toBe("test");
  });

  it("normalizeIds should handle nested objects", () => {
    const input = { parent: { id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" } };
    const result = ContentReportingTestHelper.normalizeIds(input) as any;
    expect(result.parent.id).toBe("00000000-0000-0000-0000-000000000000");
  });

  it("normalizeIds should handle arrays", () => {
    const input = [{ id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890" }];
    const result = ContentReportingTestHelper.normalizeIds(input) as any;
    expect(result[0].id).toBe("00000000-0000-0000-0000-000000000000");
  });
});
