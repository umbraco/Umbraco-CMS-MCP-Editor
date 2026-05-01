import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
} from "./setup.js";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import {
  initMemberReportingTestState,
  cleanupMemberReportingTestState,
} from "./setup.js";
import reportMemberCountTool from "../get/report-member-count.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

describe("report-member-count", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  beforeAll(async () => {
    await initMemberReportingTestState(extra);
  }, 60000);

  afterAll(async () => {
    await cleanupMemberReportingTestState();
  }, 30000);

  it("should return member count breakdown by type and group", async () => {
    const result = await callTool(reportMemberCountTool, {}, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.totalMembers).toEqual(expect.any(Number));
    expect(data.byType).toBeInstanceOf(Array);
    expect(data.byGroup).toBeInstanceOf(Array);
  }, 60000);

  it("response satisfies the tool's output schema", async () => {
    const result = await callTool(reportMemberCountTool, {}, extra);
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    for (const entry of data.byType) {
      expect(typeof entry.memberType).toBe("string");
    }
  }, 60000);

  it("should return no error on normal call", async () => {
    const result = await callTool(reportMemberCountTool, {}, extra);
    expect(result.isError).toBeFalsy();
  }, 60000);
});
