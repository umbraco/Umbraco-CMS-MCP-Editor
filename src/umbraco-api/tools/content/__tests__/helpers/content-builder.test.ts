/**
 * Content Builder Tests
 *
 * Verifies the ContentBuilder and ContentTestHelper work correctly
 * via chained CMS tools against a real Umbraco instance.
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { ContentBuilder } from "./content-builder.js";
import { ContentTestHelper } from "./content-test-helper.js";
import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

const TEST_DOCUMENT_NAME = "_Test ContentBuilder";
const TEST_RECYCLE_BIN_NAME = "_Test ContentBuilder RecycleBin";
const TEST_PUBLISHED_NAME = "_Test ContentBuilder Published";
const TEST_UPDATE_NAME = "_Test ContentBuilder Update";
const TEST_UPDATED_NAME = "_Test ContentBuilder Updated";

/** Find an allowed document type for root or under a parent */
async function findDocumentTypeId(parentId?: string): Promise<string | null> {
  if (parentId) {
    // Check existing children and use their doc type
    const children = await ContentTestHelper.getChildren(parentId, 5);
    if (children.length > 0) {
      const childResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: children[0].id });
      if (!childResult.isError) {
        const child = extractChainedResult(childResult);
        if (child?.documentType?.id) return child.documentType.id;
      }
    }
  }

  // Fallback: find root page and use its doc type
  const rootResult = await mcpClientManager.callTool("cms", "get-tree-document-root", {
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

describe("ContentBuilder", () => {
  setupTestEnvironment();

  let cmsAvailable = false;
  let documentTypeId: string | null = null;

  beforeAll(async () => {
    try {
      documentTypeId = await findDocumentTypeId();
      cmsAvailable = documentTypeId !== null;
    } catch {
      console.warn("CMS not available — ContentBuilder tests will be skipped");
    }
  }, 60000);

  afterEach(async () => {
    await ContentTestHelper.cleanup(TEST_DOCUMENT_NAME);
    await ContentTestHelper.cleanup(TEST_RECYCLE_BIN_NAME);
    await ContentTestHelper.cleanup(TEST_PUBLISHED_NAME);
    await ContentTestHelper.cleanup(TEST_UPDATE_NAME);
    await ContentTestHelper.cleanup(TEST_UPDATED_NAME);
  }, 30000);

  it("should create a document and find it by name", async () => {
    if (!cmsAvailable || !documentTypeId) return;

    const builder = await new ContentBuilder()
      .withName(TEST_DOCUMENT_NAME)
      .withDocumentType(documentTypeId)
      .create();

    const found = await ContentTestHelper.findDocument(TEST_DOCUMENT_NAME);
    expect(found).toBeDefined();
    expect(ContentTestHelper.getNameFromItem(found)).toBe(TEST_DOCUMENT_NAME);
  }, 30000);

  it("should return the created document's id and item", async () => {
    if (!cmsAvailable || !documentTypeId) return;

    const builder = await new ContentBuilder()
      .withName(TEST_DOCUMENT_NAME)
      .withDocumentType(documentTypeId)
      .create();

    const id = builder.getId();
    const item = builder.getCreatedItem();
    expect(id).toBeDefined();
    expect(item).toBeDefined();
    expect(ContentTestHelper.getNameFromItem(item)).toBe(TEST_DOCUMENT_NAME);
  }, 30000);

  it("should move a document to the recycle bin", async () => {
    if (!cmsAvailable || !documentTypeId) return;

    const builder = await new ContentBuilder()
      .withName(TEST_RECYCLE_BIN_NAME)
      .withDocumentType(documentTypeId)
      .create();

    await builder.moveToRecycleBin();

    const foundNormal = await ContentTestHelper.findDocument(TEST_RECYCLE_BIN_NAME);
    expect(foundNormal).toBeUndefined();

    const foundRecycled = await ContentTestHelper.findDocumentInRecycleBin(TEST_RECYCLE_BIN_NAME);
    expect(foundRecycled).toBeDefined();
  }, 30000);

  it("should throw if moveToRecycleBin called before create", async () => {
    const builder = new ContentBuilder()
      .withName("_Test Error")
      .withDocumentType("fake-id");

    await expect(builder.moveToRecycleBin()).rejects.toThrow(/No document has been created yet/);
  });

  it("should throw if create called without document type", async () => {
    const builder = new ContentBuilder().withName("_Test Error");
    await expect(builder.create()).rejects.toThrow(/Document type ID is required/);
  });

  it("should throw if create called without name", async () => {
    const builder = new ContentBuilder().withDocumentType("fake-id");
    await expect(builder.create()).rejects.toThrow(/Document must have a name/);
  });

  it("should cleanup remove a document permanently", async () => {
    if (!cmsAvailable || !documentTypeId) return;

    await new ContentBuilder()
      .withName(TEST_DOCUMENT_NAME)
      .withDocumentType(documentTypeId)
      .create();

    await ContentTestHelper.cleanup(TEST_DOCUMENT_NAME);

    const found = await ContentTestHelper.findDocument(TEST_DOCUMENT_NAME);
    expect(found).toBeUndefined();

    const foundRecycled = await ContentTestHelper.findDocumentInRecycleBin(TEST_DOCUMENT_NAME);
    expect(foundRecycled).toBeUndefined();
  }, 30000);
});
