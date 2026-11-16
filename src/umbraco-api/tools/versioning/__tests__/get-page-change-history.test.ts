import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initVersioningTestState,
  NON_EXISTENT_UUID,
} from "./setup.js";
import { encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import getPageChangeHistoryTool from "../get/get-page-change-history.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

describe("get-page-change-history", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initVersioningTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  // Regression coverage for issue #307: get-page-change-history resolves
  // audit-log user IDs to names via a shared resolveUserNames() helper that
  // now checks Users-section access once before calling get-user-by-id. The
  // API user these integration tests authenticate as is a full admin, so it
  // always has that access — this exercises the unchanged happy path only.
  // The "no Users access → raw ID, no get-user-by-id call" branch can't be
  // forced against a real admin user and is covered instead by the mocked
  // unit tests in helpers/__tests__/resolve-user-names.test.ts and
  // helpers/__tests__/users-access.test.ts.
  it("should return change history entries for a page", async () => {
    const result = await callTool(getPageChangeHistoryTool, { id: testPageId }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.name).toEqual(expect.any(String));
    expect(data.entries).toBeInstanceOf(Array);
    expect(data.total).toEqual(expect.any(Number));

    if (data.entries.length > 0) {
      const entry = data.entries[0];
      expect(entry).toHaveProperty("user");
      expect(entry).toHaveProperty("timestamp");
      expect(entry).toHaveProperty("action");
      expect(entry).toHaveProperty("description");
      expect(typeof entry.user).toBe("string");
      expect(typeof entry.timestamp).toBe("string");
      expect(typeof entry.action).toBe("string");
      expect(typeof entry.description).toBe("string");
    }
  }, 30000);

  it("should honour pagination limits via cursor", async () => {
    const result = await callTool(
      getPageChangeHistoryTool,
      { id: testPageId, cursor: encodeCursor({ s: 0, t: 1 }) },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.entries.length).toBeLessThanOrEqual(1);
  }, 30000);

  it("should return error for non-existent page", async () => {
    const result = await callTool(getPageChangeHistoryTool, { id: NON_EXISTENT_UUID }, extra);
    expect(result.isError).toBeTruthy();
  }, 30000);
});
