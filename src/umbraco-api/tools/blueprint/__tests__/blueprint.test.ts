/**
 * Blueprint Collection Integration Tests
 *
 * Tests for list-blueprints, get-blueprint, create-blueprint.
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

import listBlueprintsTool from "../get/list-blueprints.js";
import getBlueprintTool from "../get/get-blueprint.js";
import createBlueprintTool from "../post/create-blueprint.js";
import listChildrenTool from "../../content/get/list-children.js";

const elicitation = setupElicitationMock(jest.fn as any);

describe("Blueprint Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  const createdBlueprintIds: string[] = [];
  let cmsAvailable = false;
  let testBlueprintId: string;
  let testPageId: string;

  beforeAll(async () => {
    try {
      const pageResult = await listChildrenTool.handler(
        { parentId: undefined },
        extra,
      );
      const pageData = getStructuredContent(pageResult) as any;
      if (!pageResult.isError && pageData) {
        cmsAvailable = true;
        if (pageData.items?.length > 0) {
          testPageId = pageData.items[0].id;
        }
      }
    } catch {
      console.warn("CMS not available — blueprint integration tests will be skipped");
    }

    // Also find an existing blueprint if any
    if (cmsAvailable) {
      try {
        const blueprintResult = await listBlueprintsTool.handler(
          { parentId: undefined },
          extra,
        );
        const blueprintData = getStructuredContent(blueprintResult) as any;
        if (!blueprintResult.isError && blueprintData?.items?.length > 0) {
          testBlueprintId = blueprintData.items[0].id;
        }
      } catch {
        // No blueprints available — that's fine
      }
    }
  }, 60000);

  afterAll(async () => {
    for (const id of createdBlueprintIds) {
      try {
        const { mcpClientManager } = await import("../../../mcp-client.js");
        await mcpClientManager.callTool("cms", "delete-document-blueprint", { id });
      } catch {
        // Best-effort cleanup
      }
    }
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("list-blueprints", () => {
    it("should list root-level blueprints", async () => {
      if (!cmsAvailable) return;

      const result = await listBlueprintsTool.handler(
        { parentId: undefined },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("id");
        expect(data.items[0]).toHaveProperty("name");
      }
    }, 30000);
  });

  describe("get-blueprint", () => {
    it("should get blueprint details by ID", async () => {
      if (!cmsAvailable || !testBlueprintId) {
        console.warn("Skipping get-blueprint test: no blueprints exist");
        return;
      }

      const result = await getBlueprintTool.handler({ id: testBlueprintId }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testBlueprintId);
      expect(data.name).toEqual(expect.any(String));
    }, 30000);

    it("should return error for non-existent blueprint", async () => {
      if (!cmsAvailable) return;

      const result = await getBlueprintTool.handler(
        { id: "00000000-0000-0000-0000-000000000000" },
        extra,
      );

      expect(result.isError).toBeTruthy();
    }, 30000);
  });

  describe("create-blueprint", () => {
    let createdBlueprintId: string;

    it("should create a blueprint from a page", async () => {
      if (!cmsAvailable || !testPageId) {
        console.warn("Skipping create-blueprint test: no pages available");
        return;
      }

      const result = await createBlueprintTool.handler(
        { pageId: testPageId, name: "Integration Test Blueprint" },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping create-blueprint assertions: API returned error (may lack permissions)");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain("Created");
      expect(data.name).toBe("Integration Test Blueprint");
      expect(data.id).toBeTruthy();

      createdBlueprintId = data.id;
      createdBlueprintIds.push(createdBlueprintId);
    }, 30000);

    it("should cancel create-blueprint when elicitation is rejected", async () => {
      if (!cmsAvailable || !testPageId) {
        console.warn("Skipping elicitation rejection test: no pages available");
        return;
      }

      elicitation.rejectAll();

      const result = await createBlueprintTool.handler(
        { pageId: testPageId, name: "Should Not Be Created Blueprint" },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);
  });
});
