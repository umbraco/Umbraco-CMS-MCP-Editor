/**
 * Bulk Operations Test Helper Tests
 *
 * Verifies the BulkOperationsTestHelper works correctly
 * via chained CMS tools against a real Umbraco instance.
 */

import { describe, it, expect, beforeAll } from "@jest/globals";
import { setupTestEnvironment, createMockRequestHandlerExtra, getStructuredContent } from "@umbraco-cms/mcp-server-sdk/testing";
import { BulkOperationsTestHelper } from "./bulk-operations-test-helper.js";
import listChildrenTool from "../../../content/get/list-children.js";

describe("BulkOperationsTestHelper", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const result = await listChildrenTool.handler({ parentId: undefined }, extra);
    const data = getStructuredContent(result) as any;
    expect(data?.items?.length).toBeGreaterThan(0);
    testPageId = data.items[0].id;
  }, 60000);

  it("should get document type ID from an existing page", async () => {
    const docTypeId = await BulkOperationsTestHelper.getDocumentTypeId(testPageId);
    expect(docTypeId).toBeDefined();
    expect(docTypeId!.length).toBeGreaterThan(0);
  }, 30000);

  it("should return undefined for non-existent page", async () => {
    const docTypeId = await BulkOperationsTestHelper.getDocumentTypeId("00000000-0000-0000-0000-000000000000");
    expect(docTypeId).toBeUndefined();
  }, 30000);

  it("deletePage should handle non-existent page gracefully", async () => {
    // Should not throw for a non-existent page
    await BulkOperationsTestHelper.deletePage("00000000-0000-0000-0000-000000000000");
  }, 30000);
});
