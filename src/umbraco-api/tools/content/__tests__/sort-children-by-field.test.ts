import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initContentTestState,
  ContentBuilder,
  ContentTestHelper,
} from "./setup.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import sortChildrenByFieldTool from "../put/sort-children-by-field.js";
import sortChildrenTool from "../put/sort-children.js";
import listChildrenTool from "../get/list-children.js";

// Named so alphabetical order is unambiguous and independent of any other content.
const ALPHA = "_Test SortByField Alpha";
const ZULU = "_Test SortByField Zulu";
const ROOT_ALPHA = "_Test SortByField Root Alpha";
const ROOT_ZULU = "_Test SortByField Root Zulu";

describe("sort-children-by-field", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testParentId: string;
  let testDocumentTypeId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testParentId = state.testPageId;
    testDocumentTypeId = state.testDocumentTypeId;
  }, 60000);

  afterEach(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop()!;
      await ContentTestHelper.cleanupById(id);
    }
  }, 30000);

  const orderOfTestPages = async (alphaId: string, zuluId: string): Promise<string[]> => {
    const listResult = await callTool(listChildrenTool, { parentId: testParentId }, extra);
    const listData = getStructuredContent(listResult) as any;
    return listData.items
      .filter((i: any) => i.id === alphaId || i.id === zuluId)
      .map((i: any) => i.id);
  };

  it("sorts children by name ascending and descending", async () => {
    // Create Zulu first so the default (sortOrder) order is the opposite of A-Z.
    const zulu = await new ContentBuilder()
      .withName(ZULU)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    createdIds.push(zulu.getId());

    const alpha = await new ContentBuilder()
      .withName(ALPHA)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    createdIds.push(alpha.getId());

    expect(await orderOfTestPages(alpha.getId(), zulu.getId())).toEqual([zulu.getId(), alpha.getId()]);

    const ascResult = await callTool(
      sortChildrenByFieldTool,
      { parentId: testParentId, field: "Name", direction: "Ascending" },
      extra,
    );
    expect(ascResult.isError).toBeFalsy();
    const ascData = getStructuredContent(ascResult) as any;
    expect(ascData.field).toBe("Name");
    expect(ascData.direction).toBe("Ascending");
    expect(ascData.sorted).toBeGreaterThanOrEqual(2);
    expect(ascData.items.map((i: any) => i.id)).toContain(alpha.getId());

    expect(await orderOfTestPages(alpha.getId(), zulu.getId())).toEqual([alpha.getId(), zulu.getId()]);

    const descResult = await callTool(
      sortChildrenByFieldTool,
      { parentId: testParentId, field: "Name", direction: "Descending" },
      extra,
    );
    expect(descResult.isError).toBeFalsy();
    const descData = getStructuredContent(descResult) as any;
    expect(descData.direction).toBe("Descending");

    expect(await orderOfTestPages(alpha.getId(), zulu.getId())).toEqual([zulu.getId(), alpha.getId()]);
  }, 120000);

  it("defaults to Ascending when no direction is given", async () => {
    const zulu = await new ContentBuilder()
      .withName(ZULU)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    createdIds.push(zulu.getId());

    const alpha = await new ContentBuilder()
      .withName(ALPHA)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    createdIds.push(alpha.getId());

    // Force a known non-alphabetical starting order.
    await callTool(
      sortChildrenTool,
      {
        parentId: testParentId,
        sorting: [
          { id: zulu.getId(), sortOrder: 0 },
          { id: alpha.getId(), sortOrder: 1 },
        ],
      },
      extra,
    );

    const result = await callTool(sortChildrenByFieldTool, { parentId: testParentId, field: "Name" }, extra);
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.direction).toBe("Ascending");

    expect(await orderOfTestPages(alpha.getId(), zulu.getId())).toEqual([alpha.getId(), zulu.getId()]);
  }, 120000);

  // Omitting parentId routes to a different chained pair — sort-document-root-children
  // + get-document-root — than the parentId branch above. Without this the root path
  // was never executed by any test.
  it("sorts the pages at the content root when parentId is omitted", async () => {
    // The root page's own document type is by definition allowed at the content root.
    const rootDocResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: testParentId });
    expect(rootDocResult.isError).toBeFalsy();
    const rootDocTypeId: string = extractChainedResult(rootDocResult).documentType.id;

    // Capture the existing root order so the suite leaves the tree as it found it —
    // other suites resolve their fixtures from the first root page.
    const beforeResult = await callTool(listChildrenTool, { parentId: undefined, take: 100 }, extra);
    const originalRootIds: string[] = (getStructuredContent(beforeResult) as any).items.map((i: any) => i.id);

    // Create Zulu first so the default (sortOrder) order is the opposite of A-Z.
    const zulu = await new ContentBuilder().withName(ROOT_ZULU).withDocumentType(rootDocTypeId).create();
    createdIds.push(zulu.getId());

    const alpha = await new ContentBuilder().withName(ROOT_ALPHA).withDocumentType(rootDocTypeId).create();
    createdIds.push(alpha.getId());

    const orderOfRootTestPages = async (): Promise<string[]> => {
      const listResult = await callTool(listChildrenTool, { parentId: undefined, take: 100 }, extra);
      const listData = getStructuredContent(listResult) as any;
      return listData.items
        .filter((i: any) => i.id === alpha.getId() || i.id === zulu.getId())
        .map((i: any) => i.id);
    };

    expect(await orderOfRootTestPages()).toEqual([zulu.getId(), alpha.getId()]);

    try {
      const ascResult = await callTool(sortChildrenByFieldTool, { field: "Name", direction: "Ascending" }, extra);
      expect(ascResult.isError).toBeFalsy();
      const ascData = getStructuredContent(ascResult) as any;
      expect(ascData.field).toBe("Name");
      expect(ascData.direction).toBe("Ascending");
      // Root-level sort reports every root page, not just the two this test made.
      expect(ascData.sorted).toBeGreaterThanOrEqual(2);
      // No parent to preview when sorting at the root.
      expect(ascData.parentPreviewUrl).toBeNull();

      expect(await orderOfRootTestPages()).toEqual([alpha.getId(), zulu.getId()]);

      const descResult = await callTool(sortChildrenByFieldTool, { field: "Name", direction: "Descending" }, extra);
      expect(descResult.isError).toBeFalsy();
      expect((getStructuredContent(descResult) as any).direction).toBe("Descending");

      expect(await orderOfRootTestPages()).toEqual([zulu.getId(), alpha.getId()]);
    } finally {
      // Restore the pre-test root ordering (afterEach only removes the created pages).
      await callTool(
        sortChildrenTool,
        {
          parentId: undefined,
          sorting: originalRootIds.map((id, sortOrder) => ({ id, sortOrder })),
        },
        extra,
      );
    }
  }, 180000);
});
