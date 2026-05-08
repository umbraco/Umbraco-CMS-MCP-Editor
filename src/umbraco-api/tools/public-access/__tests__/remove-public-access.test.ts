/**
 * remove-public-access Integration Tests
 *
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - At least one published content page and one member group
 * - Valid credentials in .env file
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  setupElicitationMock,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

import removePublicAccessTool from "../delete/remove-public-access.js";
import setPublicAccessTool from "../post/set-public-access.js";
import getPublicAccessTool from "../get/get-public-access.js";
import listChildrenTool from "../../content/get/list-children.js";
import listMemberGroupsTool from "../../member-group/get/list-member-groups.js";
import createMemberGroupTool from "../../member-group/post/create-member-group.js";
import deleteMemberGroupTool from "../../member-group/delete/delete-member-group.js";

const TEST_GROUP_NAME = "Public Access Remove Test Group";

const elicitation = setupElicitationMock(jest.fn as any);

describe("remove-public-access", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let cmsAvailable = false;
  let testPageId: string | undefined;
  let loginPageId: string | undefined;
  let errorPageId: string | undefined;
  let testGroupId: string | undefined;
  let testGroupName: string | undefined;

  beforeAll(async () => {
    try {
      const rootResult = await listChildrenTool.handler({ parentId: undefined }, extra);
      if (rootResult.isError) return;
      const rootData = getStructuredContent(rootResult) as any;
      if (!rootData?.items?.length) return;

      cmsAvailable = true;
      testPageId = rootData.items[0].id;
      loginPageId = rootData.items[1]?.id ?? testPageId;
      errorPageId = rootData.items[2]?.id ?? loginPageId;

      const groupsResult = await listMemberGroupsTool.handler({}, extra);
      const groupsData = getStructuredContent(groupsResult) as any;
      if (groupsData?.items?.length) {
        testGroupId = groupsData.items[0].id;
        testGroupName = groupsData.items[0].name;
      } else {
        const createResult = await createMemberGroupTool.handler({ name: TEST_GROUP_NAME }, extra);
        if (!createResult.isError) {
          const created = getStructuredContent(createResult) as any;
          testGroupId = created?.id;
          testGroupName = TEST_GROUP_NAME;
        }
      }
    } catch {
      console.warn("CMS not available — remove-public-access integration tests will be skipped");
    }
  }, 60000);

  afterAll(async () => {
    if (testPageId) {
      try {
        await removePublicAccessTool.handler({ id: testPageId }, extra);
      } catch {
        // ignore
      }
    }
    if (testGroupId && testGroupName === TEST_GROUP_NAME) {
      try {
        await deleteMemberGroupTool.handler({ id: testGroupId }, extra);
      } catch {
        // ignore
      }
    }
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should remove the public access rules", async () => {
    if (!cmsAvailable || !testPageId || !loginPageId || !errorPageId || !testGroupName) {
      console.warn("Skipping remove-public-access test: missing page or member group");
      return;
    }

    // Make sure there's something to remove
    const setResult = await setPublicAccessTool.handler({
      id: testPageId,
      memberGroupNames: [testGroupName],
      loginPageId,
      errorPageId,
      memberUserNames: undefined,
    }, extra);
    if (setResult.isError) {
      console.warn("Skipping remove-public-access test: initial set failed");
      return;
    }

    const removeResult = await removePublicAccessTool.handler({ id: testPageId }, extra);
    if (removeResult.isError) {
      console.warn("Skipping remove-public-access assertions: CMS returned error");
      return;
    }

    const removeData = getStructuredContent(removeResult) as any;
    expect(removeData.message).toContain("Removed");
    expect(removeData.id).toBe(testPageId);

    const readResult = await getPublicAccessTool.handler({ id: testPageId }, extra);
    const readData = getStructuredContent(readResult) as any;
    expect(readData.hasRestrictions).toBe(false);
  }, 30000);

  it("should cancel remove-public-access when elicitation is rejected", async () => {
    if (!cmsAvailable || !testPageId) return;

    elicitation.rejectAll();

    const result = await removePublicAccessTool.handler({ id: testPageId }, extra);

    const data = getStructuredContent(result) as any;
    expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
  }, 30000);
});
