/**
 * Redirect Builder & Helper Tests
 *
 * Verifies the re-exported ContentBuilder and ContentTestHelper work correctly
 * for creating and cleaning up test pages used by redirect tests.
 */

import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import { setupTestEnvironment } from "@umbraco-cms/mcp-server-sdk/testing";
import { RedirectBuilder } from "./redirect-builder.js";
import { RedirectTestHelper } from "./redirect-test-helper.js";
import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

const TEST_PAGE_NAME = "_Test RedirectBuilder";

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

describe("RedirectBuilder", () => {
  setupTestEnvironment();

  let documentTypeId: string | null = null;

  beforeAll(async () => {
    documentTypeId = await findDocumentTypeId();
    expect(documentTypeId).not.toBeNull();
  }, 60000);

  afterEach(async () => {
    await RedirectTestHelper.cleanup(TEST_PAGE_NAME);
  }, 30000);

  it("should create a page and find it by name", async () => {
    if (!documentTypeId) return;

    await new RedirectBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(documentTypeId)
      .create();

    const found = await RedirectTestHelper.findDocument(TEST_PAGE_NAME);
    expect(found).toBeDefined();
    expect(RedirectTestHelper.getNameFromItem(found)).toBe(TEST_PAGE_NAME);
  }, 30000);

  it("should cleanup remove a page permanently", async () => {
    if (!documentTypeId) return;

    await new RedirectBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(documentTypeId)
      .create();

    await RedirectTestHelper.cleanup(TEST_PAGE_NAME);

    const found = await RedirectTestHelper.findDocument(TEST_PAGE_NAME);
    expect(found).toBeUndefined();
  }, 30000);
});
