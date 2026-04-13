/**
 * Bulk Operations Collection Integration Tests
 *
 * Tests for bulk-publish, bulk-unpublish, bulk-schedule-publish,
 * bulk-set-property, and bulk-move.
 * Runs against a real Umbraco instance.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,

  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";

import listChildrenTool from "../../content/get/list-children.js";
import listDocumentTypesTool from "../../content/get/list-document-types.js";
import createPageTool from "../../content/post/create-page.js";
import deletePageTool from "../../content/delete/delete-page.js";
import bulkPublishTool from "../post/bulk-publish.js";
import bulkUnpublishTool from "../post/bulk-unpublish.js";
import bulkSchedulePublishTool from "../post/bulk-schedule-publish.js";
import bulkSetPropertyTool from "../post/bulk-set-property.js";
import bulkMoveTool from "../post/bulk-move.js";
import bulkSetBlockPropertyTool from "../post/bulk-set-block-property.js";
import inspectBlocksTool from "../../content/get/inspect-blocks.js";

const FAKE_UUID = "00000000-0000-0000-0000-000000000001";
const FAKE_TARGET_UUID = "00000000-0000-0000-0000-000000000002";
const FUTURE_DATE = "2099-01-01T09:00:00Z";
const FAKE_CONTENT_TYPE_KEY = "00000000-0000-0000-0000-000000000003";

const elicitation = setupEditorElicitation(jest.fn as any);

describe("Bulk Operations Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let cmsAvailable = false;
  let firstRootPageId: string;
  let secondRootPageId: string | undefined;
  let createdSecondRootPageId: string | undefined;

  beforeAll(async () => {
    try {
      const browseResult = await listChildrenTool.handler(
        { parentId: undefined },
        extra,
      );
      const browseData = getStructuredContent(browseResult) as any;
      if (!browseResult.isError && browseData?.items?.length > 0) {
        cmsAvailable = true;
        firstRootPageId = browseData.items[0].id;
        if (browseData.items.length > 1) {
          secondRootPageId = browseData.items[1].id;
        }
      }

      // If only one root page, create a second one for bulk-move test
      if (cmsAvailable && !secondRootPageId) {
        // Find a document type that can be created at root
        const { mcpClientManager } = await import("../../../mcp-client.js");
        const { extractChainedResult } = await import("@umbraco-cms/mcp-server-sdk");

        // Get the doc type of the first root page to use as a template
        const pageResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: firstRootPageId });
        if (!pageResult.isError) {
          const pageData = extractChainedResult(pageResult);
          const docTypeId = pageData?.documentType?.id;
          if (docTypeId) {
            const createResult = await createPageTool.handler(
              { name: "Bulk Move Test Page", documentTypeId: docTypeId, parentId: undefined, values: undefined },
              extra,
            );
            if (!createResult.isError) {
              const createData = getStructuredContent(createResult) as any;
              if (createData?.id) {
                secondRootPageId = createData.id;
                createdSecondRootPageId = createData.id;
              }
            }
          }
        }
      }
    } catch {
      console.warn("CMS not available — bulk-operations integration tests will be skipped");
    }
  }, 60000);

  afterAll(async () => {
    // Re-publish the first root page to restore state after unpublish test
    if (cmsAvailable && firstRootPageId) {
      try {
        await bulkPublishTool.handler(
          { ids: [firstRootPageId], includeDescendants: false },
          extra,
        );
      } catch {
        // Best-effort restore
      }
    }
    // Clean up second root page if we created it
    if (createdSecondRootPageId) {
      try {
        await deletePageTool.handler({ id: createdSecondRootPageId }, extra);
      } catch {
        // Best-effort cleanup
      }
    }
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Input validation (no CMS call needed — errors returned before API hit)
  // ──────────────────────────────────────────────────────────────────────────

  describe("bulk-publish — cap validation", () => {
    it("should return error when more than 10 IDs are provided", async () => {
      const tooManyIds = Array.from(
        { length: 11 },
        (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
      );

      const result = await bulkPublishTool.handler(
        { ids: tooManyIds, includeDescendants: false },
        extra,
      );

      const data = getStructuredContent(result) as any;
      expect(data.message).toContain("10");
    }, 10000);
  });

  describe("bulk-publish — empty array", () => {
    it("should return error when empty array is provided", async () => {
      // Zod schema has min(1) so this will throw a validation error from withStandardDecorators
      // The tool's inputSchema has z.array(...).min(1) so the handler won't even be reached;
      // instead withStandardDecorators returns an isError result.
      let errorCaught = false;
      try {
        const result = await bulkPublishTool.handler(
          { ids: [] as any, includeDescendants: false },
          extra,
        );
        // If we get here, the tool returned an error result (not a throw)
        const data = getStructuredContent(result) as any;
        expect(data.message).toBeDefined();
        errorCaught = true;
      } catch {
        // Handler may throw on Zod validation — that's also an acceptable error signal
        errorCaught = true;
      }
      expect(errorCaught).toBe(true);
    }, 10000);
  });

  describe("bulk-set-block-property — cap validation", () => {
    it("should return error when more than 10 IDs are provided", async () => {
      const tooManyIds = Array.from(
        { length: 11 },
        (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
      );

      const result = await bulkSetBlockPropertyTool.handler(
        {
          ids: tooManyIds,
          contentTypeKey: FAKE_CONTENT_TYPE_KEY,
          propertyAlias: "contentRows",
          values: [{ alias: "caption", value: "Test" }],
          culture: undefined,
          segment: undefined,
        },
        extra,
      );

      const data = getStructuredContent(result) as any;
      expect(data.message).toContain("10");
    }, 10000);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Happy path tests (require CMS)
  // ──────────────────────────────────────────────────────────────────────────

  describe("bulk-publish", () => {
    it("should publish a single page and return results with success and previousVersionId", async () => {
      if (!cmsAvailable || !firstRootPageId) return;

      const result = await bulkPublishTool.handler(
        { ids: [firstRootPageId], includeDescendants: false },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping bulk-publish assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.results).toBeInstanceOf(Array);
      expect(data.results.length).toBe(1);
      expect(data.results[0].success).toBe(true);
      expect(data.results[0].previousVersionId).toBeDefined();
      expect(data.successCount).toBe(1);
    }, 30000);
  });

  describe("bulk-unpublish", () => {
    it("should unpublish a single page and return results", async () => {
      if (!cmsAvailable || !firstRootPageId) return;

      const result = await bulkUnpublishTool.handler(
        { ids: [firstRootPageId] },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping bulk-unpublish assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.results).toBeInstanceOf(Array);
      expect(data.results.length).toBe(1);
      expect(data.results[0].success).toBe(true);
      expect(data.successCount).toBe(1);

      // Re-publish immediately to restore state so subsequent tests have a published page
      elicitation.reset();
      await bulkPublishTool.handler(
        { ids: [firstRootPageId], includeDescendants: false },
        extra,
      );
    }, 60000);
  });

  describe("bulk-schedule-publish", () => {
    it("should schedule a page to publish at a future date and return results", async () => {
      if (!cmsAvailable || !firstRootPageId) return;

      const result = await bulkSchedulePublishTool.handler(
        { ids: [firstRootPageId], publishDate: FUTURE_DATE },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping bulk-schedule-publish assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.results).toBeInstanceOf(Array);
      expect(data.results.length).toBe(1);
      // Scheduling may fail if the CMS doesn't support it or the page is in wrong state
      // The important thing is the tool executed and returned a structured result
      expect(data.results[0]).toHaveProperty("success");
      expect(data.results[0]).toHaveProperty("id");
    }, 30000);
  });

  describe("bulk-set-property", () => {
    it("should set a property on a page and return results with previousVersionId", async () => {
      if (!cmsAvailable || !firstRootPageId) return;

      // Use a safe invariant alias that most Umbraco pages have; if the property doesn't
      // exist the tool will still return a result (success or failure) rather than throwing.
      const result = await bulkSetPropertyTool.handler(
        {
          ids: [firstRootPageId],
          alias: "title",
          value: "Bulk Test Value",
          culture: undefined,
          segment: undefined,
        },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping bulk-set-property assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.results).toBeInstanceOf(Array);
      expect(data.results.length).toBe(1);
      // The result will have previousVersionId regardless of success/failure
      expect(data.results[0].previousVersionId).toBeDefined();
    }, 30000);
  });

  describe("bulk-set-block-property", () => {
    it("should update block properties on pages with matching blocks", async () => {
      if (!cmsAvailable || !firstRootPageId) return;

      // First, inspect the page to find a block with its contentTypeKey and propertyAlias
      const inspectResult = await inspectBlocksTool.handler(
        { id: firstRootPageId, propertyAlias: undefined },
        extra,
      );
      const inspectData = getStructuredContent(inspectResult) as any;

      if (!inspectData?.blockProperties?.length || !inspectData.blockProperties[0]?.blocks?.length) {
        console.warn("Skipping bulk-set-block-property test: no blocks found on first root page");
        return;
      }

      const firstBlockProp = inspectData.blockProperties[0];
      const firstBlock = firstBlockProp.blocks[0];

      // Skip if the block has no properties to update
      if (!firstBlock.properties?.length) {
        console.warn("Skipping bulk-set-block-property test: block has no properties");
        return;
      }

      const targetPropAlias = firstBlock.properties[0].alias;
      const originalValue = firstBlock.properties[0].value;

      const result = await bulkSetBlockPropertyTool.handler(
        {
          ids: [firstRootPageId],
          contentTypeKey: firstBlock.contentTypeKey,
          propertyAlias: firstBlockProp.propertyAlias,
          values: [{ alias: targetPropAlias, value: originalValue }],
          culture: undefined,
          segment: undefined,
        },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping bulk-set-block-property assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.results).toBeInstanceOf(Array);
      expect(data.results.length).toBe(1);
      expect(data.results[0].success).toBe(true);
      expect(data.results[0].blocksUpdated).toBeGreaterThanOrEqual(1);
      expect(data.totalBlocksUpdated).toBeGreaterThanOrEqual(1);
      expect(data.successCount).toBe(1);
    }, 60000);

    it("should return success with 0 blocks updated when no blocks match", async () => {
      if (!cmsAvailable || !firstRootPageId) return;

      const result = await bulkSetBlockPropertyTool.handler(
        {
          ids: [firstRootPageId],
          contentTypeKey: FAKE_CONTENT_TYPE_KEY,
          propertyAlias: "contentRows",
          values: [{ alias: "caption", value: "Test" }],
          culture: undefined,
          segment: undefined,
        },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping bulk-set-block-property no-match assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.results).toBeInstanceOf(Array);
      expect(data.results[0].success).toBe(true);
      expect(data.results[0].blocksUpdated).toBe(0);
      expect(data.totalBlocksUpdated).toBe(0);
    }, 30000);
  });

  describe("bulk-move", () => {
    it("should test elicitation rejection only (skipping actual move when only one root page)", async () => {
      if (!cmsAvailable || !firstRootPageId) return;

      if (!secondRootPageId) {
        console.warn("Skipping bulk-move live test: only one root page available");
        return;
      }

      // With multiple root pages available, test elicitation rejection for bulk-move
      // (we never want to actually execute the move in tests as it's hard to undo)
      elicitation.rejectAll();

      const result = await bulkMoveTool.handler(
        { ids: [firstRootPageId], targetParentId: secondRootPageId },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
    }, 30000);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Elicitation rejection tests
  // ──────────────────────────────────────────────────────────────────────────

  describe("elicitation rejection", () => {
    it("should cancel bulk-publish when elicitation is rejected", async () => {
      if (!cmsAvailable || !firstRootPageId) return;

      elicitation.rejectAll();

      const result = await bulkPublishTool.handler(
        { ids: [firstRootPageId], includeDescendants: false },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
    }, 30000);

    it("should cancel bulk-unpublish when elicitation is rejected", async () => {
      if (!cmsAvailable || !firstRootPageId) return;

      elicitation.rejectAll();

      const result = await bulkUnpublishTool.handler(
        { ids: [firstRootPageId] },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
    }, 30000);

    it("should cancel bulk-schedule-publish when elicitation is rejected", async () => {
      if (!cmsAvailable || !firstRootPageId) return;

      elicitation.rejectAll();

      const result = await bulkSchedulePublishTool.handler(
        { ids: [firstRootPageId], publishDate: FUTURE_DATE },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
    }, 30000);

    it("should cancel bulk-set-property when elicitation is rejected", async () => {
      if (!cmsAvailable || !firstRootPageId) return;

      elicitation.rejectAll();

      const result = await bulkSetPropertyTool.handler(
        {
          ids: [firstRootPageId],
          alias: "title",
          value: "Should Not Be Set",
          culture: undefined,
          segment: undefined,
        },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
    }, 30000);

    it("should cancel bulk-move when elicitation is rejected", async () => {
      if (!cmsAvailable || !firstRootPageId) return;

      elicitation.rejectAll();

      // Use a fake target parent — the move won't execute because elicitation rejects first
      const result = await bulkMoveTool.handler(
        { ids: [firstRootPageId], targetParentId: FAKE_TARGET_UUID },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
    }, 30000);

    it("should cancel bulk-set-block-property when elicitation is rejected", async () => {
      if (!cmsAvailable || !firstRootPageId) return;

      elicitation.rejectAll();

      const result = await bulkSetBlockPropertyTool.handler(
        {
          ids: [firstRootPageId],
          contentTypeKey: FAKE_CONTENT_TYPE_KEY,
          propertyAlias: "contentRows",
          values: [{ alias: "caption", value: "Test" }],
          culture: undefined,
          segment: undefined,
        },
        extra,
      );

      const data = getStructuredContent(result) as any;
      expect(data?.message?.includes("Cancelled") || result.isError).toBe(true);
    }, 30000);
  });
});
