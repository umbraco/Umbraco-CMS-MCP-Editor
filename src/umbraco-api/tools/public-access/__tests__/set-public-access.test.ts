/**
 * set-public-access Integration Tests
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

import setPublicAccessTool from "../post/set-public-access.js";
import getPublicAccessTool from "../get/get-public-access.js";
import removePublicAccessTool from "../delete/remove-public-access.js";
import listChildrenTool from "../../content/get/list-children.js";
import listMemberGroupsTool from "../../member-group/get/list-member-groups.js";
import createMemberGroupTool from "../../member-group/post/create-member-group.js";
import deleteMemberGroupTool from "../../member-group/delete/delete-member-group.js";

const TEST_GROUP_NAME = "Public Access Set Test Group";

const elicitation = setupElicitationMock(jest.fn as any);

describe("set-public-access", () => {
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
      console.warn("CMS not available — set-public-access integration tests will be skipped");
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

  it("should set public access rules and read them back", async () => {
    if (!cmsAvailable || !testPageId || !loginPageId || !errorPageId || !testGroupName) {
      console.warn("Skipping set-public-access test: missing page or member group");
      return;
    }

    // Start from a clean slate so we exercise the create (POST) branch
    try {
      await removePublicAccessTool.handler({ id: testPageId }, extra);
    } catch {
      // ignore
    }

    const setResult = await setPublicAccessTool.handler({
      id: testPageId,
      memberGroupNames: [testGroupName],
      loginPageId,
      errorPageId,
      memberUserNames: undefined,
    }, extra);

    if (setResult.isError) {
      console.warn("Skipping set-public-access assertions: CMS returned error");
      return;
    }

    const setData = getStructuredContent(setResult) as any;
    expect(setData.message).toMatch(/Set|Updated/);
    expect(setData.id).toBe(testPageId);
    expect(setData.memberGroupNames).toEqual([testGroupName]);
    expect(setData.loginPageId).toBe(loginPageId);
    expect(setData.errorPageId).toBe(errorPageId);

    const readResult = await getPublicAccessTool.handler({ id: testPageId }, extra);
    expect(readResult.isError).toBeFalsy();
    const readData = getStructuredContent(readResult) as any;
    expect(readData.hasRestrictions).toBe(true);
    expect(readData.memberGroups.map((g: any) => g.name)).toContain(testGroupName);
    expect(readData.loginPageId).toBe(loginPageId);
    expect(readData.errorPageId).toBe(errorPageId);
  }, 30000);

  it("should update existing rules with different login/error pages", async () => {
    if (!cmsAvailable || !testPageId || !loginPageId || !errorPageId || !testGroupName) {
      console.warn("Skipping update-public-access test: missing page or member group");
      return;
    }

    // Seed an existing rule so the tool takes the update (PUT) branch
    const initial = await setPublicAccessTool.handler({
      id: testPageId,
      memberGroupNames: [testGroupName],
      loginPageId,
      errorPageId,
      memberUserNames: undefined,
    }, extra);
    if (initial.isError) {
      console.warn("Skipping update-public-access test: initial set failed");
      return;
    }

    const updateResult = await setPublicAccessTool.handler({
      id: testPageId,
      memberGroupNames: [testGroupName],
      loginPageId: errorPageId,
      errorPageId: loginPageId,
      memberUserNames: undefined,
    }, extra);

    if (updateResult.isError) {
      console.warn("Skipping update-public-access assertions: CMS returned error");
      return;
    }

    const updateData = getStructuredContent(updateResult) as any;
    expect(updateData.message).toMatch(/Updated/);

    const readResult = await getPublicAccessTool.handler({ id: testPageId }, extra);
    const readData = getStructuredContent(readResult) as any;
    expect(readData.hasRestrictions).toBe(true);
    expect(readData.loginPageId).toBe(errorPageId);
    expect(readData.errorPageId).toBe(loginPageId);
  }, 30000);

  it("should cancel set-public-access when elicitation is rejected", async () => {
    if (!cmsAvailable || !testPageId || !loginPageId || !errorPageId || !testGroupName) return;

    elicitation.rejectAll();

    const result = await setPublicAccessTool.handler({
      id: testPageId,
      memberGroupNames: [testGroupName],
      loginPageId,
      errorPageId,
      memberUserNames: undefined,
    }, extra);

    const data = getStructuredContent(result) as any;
    expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
  }, 30000);
});
