/**
 * Content Health Builder Tests
 *
 * Verifies that ContentHealthBuilder (re-exported ContentBuilder) and
 * ContentHealthTestHelper work correctly via chained CMS tools against
 * a real Umbraco instance.
 */

import { describe, it, expect, afterEach } from "@jest/globals";
import { setupTestEnvironment, createMockRequestHandlerExtra } from "@umbraco-cms/mcp-server-sdk/testing";
import { ContentHealthBuilder } from "./content-health-builder.js";
import { ContentHealthTestHelper } from "./content-health-test-helper.js";
import { ContentTestHelper } from "../../../content/__tests__/helpers/content-test-helper.js";
import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

const TEST_PAGE_NAME = "_Test ContentHealthBuilder";

/** Find a document type ID usable at the root level */
async function findDocumentTypeId(): Promise<string | null> {
  const rootResult = await mcpClientManager.callTool("cms", "get-document-root", {
    cursor: btoa(JSON.stringify({ s: 0, t: 5 })),
  });
  if (rootResult.isError) return null;
  const rootData = extractChainedResult(rootResult);
  if (!rootData?.items?.length) return null;

  const pageResult = await mcpClientManager.callTool("cms", "get-document-by-id", {
    id: rootData.items[0].id,
  });
  if (pageResult.isError) return null;
  const page = extractChainedResult(pageResult);
  return page?.documentType?.id ?? null;
}

describe("ContentHealthBuilder", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();

  afterEach(async () => {
    await ContentTestHelper.cleanup(TEST_PAGE_NAME);
  }, 30000);

  it("should find a root page via ContentHealthTestHelper.findRootPage", async () => {
    const rootPageId = await ContentHealthTestHelper.findRootPage(extra);

    expect(rootPageId).toBeDefined();
    expect(typeof rootPageId).toBe("string");
    expect(rootPageId.length).toBeGreaterThan(0);
  }, 30000);

  it("should create a page via ContentHealthBuilder and find it", async () => {
    const documentTypeId = await findDocumentTypeId();
    if (!documentTypeId) {
      console.warn("No document type found — skipping builder creation test");
      return;
    }

    const builder = await new ContentHealthBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(documentTypeId)
      .create();

    const id = builder.getId();
    expect(id).toBeDefined();
    expect(typeof id).toBe("string");

    const found = await ContentTestHelper.findDocument(TEST_PAGE_NAME);
    expect(found).toBeDefined();
    expect(ContentTestHelper.getNameFromItem(found)).toBe(TEST_PAGE_NAME);
  }, 30000);

  it("should normalizeIds replace UUIDs with placeholder", () => {
    const input = {
      id: "3f0f3a7e-1234-4abc-8def-000000000001",
      name: "Test Page",
      nested: {
        parentId: "3f0f3a7e-1234-4abc-8def-000000000002",
        value: "not-a-uuid",
      },
    };

    const result = ContentHealthTestHelper.normalizeIds(input) as any;

    expect(result.id).toBe("00000000-0000-0000-0000-000000000000");
    expect(result.nested.parentId).toBe("00000000-0000-0000-0000-000000000000");
    expect(result.name).toBe("Test Page");
    expect(result.nested.value).toBe("not-a-uuid");
  });
});
