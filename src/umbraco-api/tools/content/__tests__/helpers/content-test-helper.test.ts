/**
 * Content Test Helper Tests
 *
 * Verifies the ContentTestHelper static methods work correctly
 * via chained CMS tools against a real Umbraco instance.
 */

import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { ContentBuilder } from "./content-builder.js";
import { ContentTestHelper } from "./content-test-helper.js";
import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

const TEST_HELPER_NAME = "_Test ContentHelper";
const TEST_RECYCLE_BIN_NAME = "_Test ContentHelper RecycleBin";

/** Find an allowed document type */
async function findDocumentTypeId(): Promise<string | null> {
  const rootResult = await mcpClientManager.callTool("cms", "get-document-root", {
    cursor: btoa(JSON.stringify({ s: 0, t: 5 })),
  });
  if (rootResult.isError) return null;
  const rootData = extractChainedResult(rootResult);
  if (!rootData?.items?.length) return null;

  const pageResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: rootData.items[0].id });
  if (pageResult.isError) return null;
  const page = extractChainedResult(pageResult);
  return page?.documentType?.id ?? null;
}

describe("ContentTestHelper", () => {
  setupTestEnvironment();

  let documentTypeId: string | null = null;

  beforeAll(async () => {
    documentTypeId = await findDocumentTypeId();
    expect(documentTypeId).not.toBeNull();
  }, 60000);

  afterEach(async () => {
    await ContentTestHelper.cleanup(TEST_HELPER_NAME);
    await ContentTestHelper.cleanup(TEST_RECYCLE_BIN_NAME);
  }, 30000);

  it("getNameFromItem should return the name from the first variant", async () => {
    if (!documentTypeId) return;

    const builder = await new ContentBuilder()
      .withName(TEST_HELPER_NAME)
      .withDocumentType(documentTypeId)
      .create();

    const item = builder.getCreatedItem();
    expect(ContentTestHelper.getNameFromItem(item)).toBe(TEST_HELPER_NAME);
  }, 30000);

  it("getNameFromItem should return empty string for undefined", () => {
    expect(ContentTestHelper.getNameFromItem(undefined)).toBe("");
  });

  it("getNameFromItem should return empty string for item without variants", () => {
    expect(ContentTestHelper.getNameFromItem({ id: "test" })).toBe("");
  });

  it("findDocument should find a document by variant name", async () => {
    if (!documentTypeId) return;

    await new ContentBuilder()
      .withName(TEST_HELPER_NAME)
      .withDocumentType(documentTypeId)
      .create();

    const found = await ContentTestHelper.findDocument(TEST_HELPER_NAME);
    expect(found).toBeDefined();
    expect(ContentTestHelper.getNameFromItem(found!)).toBe(TEST_HELPER_NAME);
  }, 30000);

  it("findDocument should return undefined for non-existent name", async () => {
    const found = await ContentTestHelper.findDocument("_NonExistent Document Name 99999");
    expect(found).toBeUndefined();
  }, 30000);

  it("cleanup should remove a document permanently", async () => {
    if (!documentTypeId) return;

    await new ContentBuilder()
      .withName(TEST_HELPER_NAME)
      .withDocumentType(documentTypeId)
      .create();

    // Verify it exists
    let found = await ContentTestHelper.findDocument(TEST_HELPER_NAME);
    expect(found).toBeDefined();

    // Cleanup
    await ContentTestHelper.cleanup(TEST_HELPER_NAME);

    // Should not be found after cleanup
    found = await ContentTestHelper.findDocument(TEST_HELPER_NAME);
    expect(found).toBeUndefined();

    // Should not be in recycle bin either
    const foundRecycled = await ContentTestHelper.findDocumentInRecycleBin(TEST_HELPER_NAME);
    expect(foundRecycled).toBeUndefined();
  }, 30000);

  it("findDocumentInRecycleBin should find a recycled document", async () => {
    if (!documentTypeId) return;

    const builder = await new ContentBuilder()
      .withName(TEST_RECYCLE_BIN_NAME)
      .withDocumentType(documentTypeId)
      .create();

    await builder.moveToRecycleBin();

    // Should not be in normal tree
    const foundNormal = await ContentTestHelper.findDocument(TEST_RECYCLE_BIN_NAME);
    expect(foundNormal).toBeUndefined();

    // Should be in recycle bin
    const foundRecycled = await ContentTestHelper.findDocumentInRecycleBin(TEST_RECYCLE_BIN_NAME);
    expect(foundRecycled).toBeDefined();
  }, 30000);

  it("findDocumentInRecycleBin should return undefined for non-existent document", async () => {
    const found = await ContentTestHelper.findDocumentInRecycleBin("_NonExistent RecycleBin Doc 99999");
    expect(found).toBeUndefined();
  }, 30000);

  it("getChildren should return child documents for a page with children", async () => {
    // Find an existing page that has children rather than creating one
    // (creating children may fail if the doc type doesn't allow nesting)
    const rootResult = await mcpClientManager.callTool("cms", "get-document-root", {
      cursor: btoa(JSON.stringify({ s: 0, t: 20 })),
    });
    const rootData = extractChainedResult(rootResult);
    const parentWithChildren = (rootData?.items ?? []).find((item: any) => item.hasChildren);

    if (!parentWithChildren) {
      console.warn("No pages with children found — skipping getChildren test");
      return;
    }

    const children = await ContentTestHelper.getChildren(parentWithChildren.id, 10);
    expect(children.length).toBeGreaterThan(0);
    expect(children[0]).toHaveProperty("id");
  }, 30000);

  it("cleanup should handle non-existent document gracefully", async () => {
    // Should not throw
    await ContentTestHelper.cleanup("_NonExistent Cleanup Target 99999");
  }, 30000);
});
