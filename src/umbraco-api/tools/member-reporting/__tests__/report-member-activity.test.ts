import { describe, it, expect } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
} from "./setup.js";
import { getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import reportMemberActivityTool from "../get/report-member-activity.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";

describe("report-member-activity", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  it("should return inactive members for given threshold", async () => {
    const result = await callTool(reportMemberActivityTool, { inactiveDays: 90 }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.threshold).toBe(90);
    expect(data.inactiveCount).toEqual(expect.any(Number));
    expect(data.total).toEqual(expect.any(Number));
    expect(data.items).toBeInstanceOf(Array);
  }, 60000);

  it("response satisfies the tool's output schema", async () => {
    const result = await callTool(reportMemberActivityTool, { inactiveDays: 90 }, extra);
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    for (const item of data.items) {
      expect(typeof item.memberType).toBe("string");
    }
  }, 60000);
});
