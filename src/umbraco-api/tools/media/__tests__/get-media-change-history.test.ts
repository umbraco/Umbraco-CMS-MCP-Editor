import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initMediaTestState,
} from "./setup.js";
import { encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import getMediaChangeHistoryTool from "../get/get-media-change-history.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

describe("get-media-change-history", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testMediaId: string;

  beforeAll(async () => {
    const state = await initMediaTestState(extra);
    testMediaId = state.testMediaId;
  }, 60000);

  // Regression coverage for issue #307 — see the equivalent comment in
  // versioning/__tests__/get-page-change-history.test.ts. The permission-gated
  // branch (no Users access → raw ID, no get-user-by-id call) is covered by
  // the mocked unit tests in helpers/__tests__/resolve-user-names.test.ts.
  it("should return change history entries for a media item", async () => {
    const result = await callTool(getMediaChangeHistoryTool, { id: testMediaId }, extra);

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
      // The test API user is an admin, so resolveUserNames() must have resolved this
      // to a display name, not fallen back to the raw GUID — proves the fix's happy
      // path is actually wired into the live call, not just unit-tested in isolation.
      expect(entry.user).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    }
  }, 30000);

  it("should honour pagination limits via cursor", async () => {
    const result = await callTool(
      getMediaChangeHistoryTool,
      { id: testMediaId, cursor: encodeCursor({ s: 0, t: 1 }) },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.entries.length).toBeLessThanOrEqual(1);
  }, 30000);

  it("should return error for non-existent media item", async () => {
    const result = await callTool(
      getMediaChangeHistoryTool,
      { id: "00000000-0000-0000-0000-000000000000" },
      extra,
    );
    expect(result.isError).toBeTruthy();
  }, 30000);
});
