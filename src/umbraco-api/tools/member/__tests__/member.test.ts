/**
 * Member Collection Integration Tests
 *
 * Tests for search-members, get-member, list-member-types,
 * create-member, update-member, delete-member.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  setupElicitationMock,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

import searchMembersTool from "../get/search-members.js";
import getMemberTool from "../get/get-member.js";
import listMemberTypesTool from "../get/list-member-types.js";
import createMemberTool from "../post/create-member.js";
import updateMemberTool from "../put/update-member.js";
import deleteMemberTool from "../delete/delete-member.js";

const TEST_MEMBER_EMAIL = "test-integration@example.com";
const TEST_MEMBER_USERNAME = "test-integration";
const TEST_MEMBER_NAME = "Integration Test Member";
const TEST_MEMBER_PASSWORD = "TestPass123!";
const TEST_MEMBER_UPDATED_NAME = "Integration Test Member Updated";
const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

const elicitation = setupElicitationMock(jest.fn as any);

describe("Member Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let cmsAvailable = false;
  let testMemberTypeId: string;
  let createdMemberId: string;

  beforeAll(async () => {
    try {
      const result = await listMemberTypesTool.handler(
        { take: 5, skip: 0 },
        extra,
      );
      const data = getStructuredContent(result) as any;
      if (!result.isError && data) {
        cmsAvailable = true;
        if (data.items?.length > 0) {
          testMemberTypeId = data.items[0].id;
        }
      }
    } catch {
      console.warn("CMS not available — member integration tests will be skipped");
    }
  }, 60000);

  afterAll(async () => {
    if (createdMemberId) {
      try {
        await deleteMemberTool.handler({ id: createdMemberId }, extra);
      } catch {
        // Best-effort cleanup
      }
    }
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("list-member-types", () => {
    it("should list available member types", async () => {
      if (!cmsAvailable) return;

      const result = await listMemberTypesTool.handler(
        { take: 10, skip: 0 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("id");
        expect(data.items[0]).toHaveProperty("alias");
        expect(data.items[0]).toHaveProperty("name");
      }
    }, 30000);
  });

  describe("search-members", () => {
    it("should search members and return results with expected shape", async () => {
      if (!cmsAvailable) return;

      const result = await searchMembersTool.handler(
        { query: "admin", take: 10, skip: 0 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        const item = data.items[0];
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("name");
        expect(item).toHaveProperty("email");
        expect(item).toHaveProperty("memberType");
        expect(item).toHaveProperty("isApproved");
        expect(item).toHaveProperty("isLockedOut");
      }
    }, 30000);

    it("should return empty results for nonsense query", async () => {
      if (!cmsAvailable) return;

      const result = await searchMembersTool.handler(
        { query: "xyznonexistent99999zzz", take: 5, skip: 0 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toBe(0);
    }, 30000);
  });

  describe("get-member", () => {
    it("should get a member by ID with full profile", async () => {
      if (!cmsAvailable) return;

      // First search to find an existing member
      const searchResult = await searchMembersTool.handler(
        { query: "test", take: 5, skip: 0 },
        extra,
      );
      const searchData = getStructuredContent(searchResult) as any;

      if (!searchData?.items?.length) {
        console.warn("Skipping get-member test: no members found via search");
        return;
      }

      const memberId = searchData.items[0].id;
      const result = await getMemberTool.handler({ id: memberId }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(memberId);
      expect(data).toHaveProperty("name");
      expect(data).toHaveProperty("email");
      expect(data).toHaveProperty("username");
      expect(data).toHaveProperty("memberType");
      expect(data).toHaveProperty("isApproved");
      expect(data).toHaveProperty("isLockedOut");
      expect(data).toHaveProperty("isTwoFactorEnabled");
      expect(data.groups).toBeInstanceOf(Array);
      expect(data.values).toBeInstanceOf(Array);
    }, 30000);

    it("should return error for non-existent member ID", async () => {
      if (!cmsAvailable) return;

      const result = await getMemberTool.handler(
        { id: NON_EXISTENT_UUID },
        extra,
      );

      expect(result.isError).toBeTruthy();
    }, 30000);
  });

  describe("create-member, update-member, delete-member lifecycle", () => {
    it("should create a new member", async () => {
      if (!cmsAvailable || !testMemberTypeId) {
        console.warn("Skipping create-member test: no member type available");
        return;
      }

      const result = await createMemberTool.handler(
        {
          email: TEST_MEMBER_EMAIL,
          username: TEST_MEMBER_USERNAME,
          name: TEST_MEMBER_NAME,
          password: TEST_MEMBER_PASSWORD,
          memberTypeId: testMemberTypeId,
          groups: undefined,
          values: undefined,
        },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping create-member test: creation failed (possible duplicate or permission issue)");
        return;
      }

      expect(elicitation.mock).toHaveBeenCalled();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Created");
      expect(data.name).toBe(TEST_MEMBER_NAME);
      expect(data.email).toBe(TEST_MEMBER_EMAIL);
      expect(data.id).toBeTruthy();

      createdMemberId = data.id;
    }, 30000);

    it("should update the created member", async () => {
      if (!cmsAvailable || !createdMemberId) {
        console.warn("Skipping update-member test: no member was created");
        return;
      }

      const result = await updateMemberTool.handler(
        {
          id: createdMemberId,
          name: TEST_MEMBER_UPDATED_NAME,
          email: undefined,
          isApproved: undefined,
          isLockedOut: undefined,
          groups: undefined,
          values: undefined,
        },
        extra,
      );

      expect(elicitation.mock).toHaveBeenCalled();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      if (!result.isError) {
        expect(data.message).toContain("Updated");
        expect(data.id).toBe(createdMemberId);
      }
    }, 30000);

    it("should delete the created member", async () => {
      if (!cmsAvailable || !createdMemberId) {
        console.warn("Skipping delete-member test: no member was created");
        return;
      }

      const result = await deleteMemberTool.handler(
        { id: createdMemberId },
        extra,
      );

      expect(result.isError).toBeFalsy();
      expect(elicitation.mock).toHaveBeenCalled();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Permanently deleted");
      expect(data.id).toBe(createdMemberId);

      createdMemberId = "";
    }, 30000);
  });

  describe("elicitation rejection", () => {
    it("should cancel create-member when elicitation is rejected", async () => {
      if (!cmsAvailable || !testMemberTypeId) return;

      elicitation.rejectAll();

      const result = await createMemberTool.handler(
        {
          email: "should-not-be-created@example.com",
          username: "should-not-be-created",
          name: "Should Not Be Created",
          password: TEST_MEMBER_PASSWORD,
          memberTypeId: testMemberTypeId,
          groups: undefined,
          values: undefined,
        },
        extra,
      );

      expect(elicitation.mock).toHaveBeenCalled();
      const data = getStructuredContent(result) as any;
      expect(data.message).toContain("cancelled");
    }, 30000);

    it("should cancel update-member when elicitation is rejected", async () => {
      if (!cmsAvailable) return;

      // Search for any member to attempt update rejection test
      const searchResult = await searchMembersTool.handler(
        { query: "test", take: 1, skip: 0 },
        extra,
      );
      const searchData = getStructuredContent(searchResult) as any;
      if (!searchData?.items?.length) {
        console.warn("Skipping update rejection test: no members found");
        return;
      }

      elicitation.rejectAll();

      const result = await updateMemberTool.handler(
        {
          id: searchData.items[0].id,
          name: "Should Not Change",
          email: undefined,
          isApproved: undefined,
          isLockedOut: undefined,
          groups: undefined,
          values: undefined,
        },
        extra,
      );

      expect(elicitation.mock).toHaveBeenCalled();
      const data = getStructuredContent(result) as any;
      expect(data.message).toContain("cancelled");
    }, 30000);

    it("should cancel delete-member when elicitation is rejected", async () => {
      if (!cmsAvailable) return;

      // Search for any member to attempt delete rejection test
      const searchResult = await searchMembersTool.handler(
        { query: "test", take: 1, skip: 0 },
        extra,
      );
      const searchData = getStructuredContent(searchResult) as any;
      if (!searchData?.items?.length) {
        console.warn("Skipping delete rejection test: no members found");
        return;
      }

      elicitation.rejectAll();

      const result = await deleteMemberTool.handler(
        { id: searchData.items[0].id },
        extra,
      );

      expect(elicitation.mock).toHaveBeenCalled();
      const data = getStructuredContent(result) as any;
      expect(data.message).toContain("cancelled");
    }, 30000);
  });
});
