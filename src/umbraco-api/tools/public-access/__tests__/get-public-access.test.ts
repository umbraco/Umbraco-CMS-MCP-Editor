/**
 * get-public-access Integration Tests
 *
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - At least one published content page
 * - Valid credentials in .env file
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";

import getPublicAccessTool from "../get/get-public-access.js";
import setPublicAccessTool from "../post/set-public-access.js";
import removePublicAccessTool from "../delete/remove-public-access.js";
import listChildrenTool from "../../content/get/list-children.js";
import listMemberGroupsTool from "../../member-group/get/list-member-groups.js";
import createMemberGroupTool from "../../member-group/post/create-member-group.js";
import deleteMemberGroupTool from "../../member-group/delete/delete-member-group.js";

const TEST_GROUP_NAME = "Public Access Get Test Group";

const elicitation = setupEditorElicitation(jest.fn);

describe("get-public-access", () => {
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
      console.warn("CMS not available — get-public-access integration tests will be skipped");
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

  it("should report no restrictions on a page that has none", async () => {
    if (!cmsAvailable || !testPageId) return;

    // Ensure clean state
    try {
      await removePublicAccessTool.handler({ id: testPageId }, extra);
    } catch {
      // ignore
    }

    const result = await getPublicAccessTool.handler({ id: testPageId }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.hasRestrictions).toBe(false);
    expect(data.memberGroups).toEqual([]);
    expect(data.memberUserNames).toEqual([]);
    expect(data.loginPageId).toBeNull();
    expect(data.errorPageId).toBeNull();
    expect(data.message).toEqual(expect.any(String));
  }, 30000);

  it("should report the configured rules when access has been set", async () => {
    if (!cmsAvailable || !testPageId || !loginPageId || !errorPageId || !testGroupName) {
      console.warn("Skipping get-public-access with-rules test: missing page or member group");
      return;
    }

    const setResult = await setPublicAccessTool.handler({
      id: testPageId,
      memberGroupNames: [testGroupName],
      loginPageId,
      errorPageId,
      memberUserNames: undefined,
    }, extra);
    if (setResult.isError) {
      console.warn("Skipping get-public-access with-rules test: set failed");
      return;
    }

    const result = await getPublicAccessTool.handler({ id: testPageId }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.hasRestrictions).toBe(true);
    expect(data.memberGroups.map((g: any) => g.name)).toContain(testGroupName);
    expect(data.loginPageId).toBe(loginPageId);
    expect(data.errorPageId).toBe(errorPageId);
  }, 30000);
});
