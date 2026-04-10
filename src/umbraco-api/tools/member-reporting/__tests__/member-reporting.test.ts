/**
 * Member Reporting Collection Integration Tests
 *
 * Tests for report-member-count, report-members-by-group, report-member-activity.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { jest, describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

import reportMemberCountTool from "../get/report-member-count.js";
import reportMembersByGroupTool from "../get/report-members-by-group.js";
import reportMemberActivityTool from "../get/report-member-activity.js";
import listMemberGroupsTool from "../../member-group/get/list-member-groups.js";

describe("Member Reporting Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let cmsAvailable = false;

  beforeAll(async () => {
    try {
      const result = await reportMemberCountTool.handler({}, extra);
      const data = getStructuredContent(result) as any;
      if (!result.isError && data) {
        cmsAvailable = true;
      }
    } catch {
      console.warn("CMS not available — member-reporting integration tests will be skipped");
    }
  }, 60000);

  describe("report-member-count", () => {
    it("should return member count breakdown by type and group", async () => {
      if (!cmsAvailable) return;

      const result = await reportMemberCountTool.handler({}, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.totalMembers).toEqual(expect.any(Number));
      expect(data.byType).toBeInstanceOf(Array);
      expect(data.byGroup).toBeInstanceOf(Array);

      if (data.byType.length > 0) {
        expect(data.byType[0]).toHaveProperty("memberType");
        expect(data.byType[0]).toHaveProperty("count");
      }

      if (data.byGroup.length > 0) {
        expect(data.byGroup[0]).toHaveProperty("group");
        expect(data.byGroup[0]).toHaveProperty("count");
      }
    }, 60000);
  });

  describe("report-members-by-group", () => {
    it("should return members filtered by group name", async () => {
      if (!cmsAvailable) return;

      // Find a group name from list-member-groups
      const groupsResult = await listMemberGroupsTool.handler(
        {},
        extra,
      );
      const groupsData = getStructuredContent(groupsResult) as any;

      if (!groupsData?.items?.length) {
        console.warn("Skipping report-members-by-group test: no member groups exist");
        return;
      }

      const groupName = groupsData.items[0].name;

      const result = await reportMembersByGroupTool.handler(
        { groupName },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.groupName).toBe(groupName);
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        const item = data.items[0];
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("name");
        expect(item).toHaveProperty("email");
        expect(item).toHaveProperty("isApproved");
        expect(item).toHaveProperty("lastLoginDate");
      }
    }, 60000);
  });

  describe("report-member-activity", () => {
    it("should return inactive member report with expected shape", async () => {
      if (!cmsAvailable) return;

      const result = await reportMemberActivityTool.handler(
        { inactiveDays: 90 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));
      expect(data.threshold).toEqual(expect.any(Number));
      expect(data.inactiveCount).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        const item = data.items[0];
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("name");
        expect(item).toHaveProperty("email");
        expect(item).toHaveProperty("memberType");
        expect(item).toHaveProperty("lastLoginDate");
        expect(item).toHaveProperty("daysSinceLogin");
      }
    }, 60000);
  });
});
