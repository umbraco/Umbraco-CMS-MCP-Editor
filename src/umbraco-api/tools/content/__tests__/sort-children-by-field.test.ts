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
import sortChildrenByFieldTool from "../put/sort-children-by-field.js";
import sortChildrenTool from "../put/sort-children.js";
import listChildrenTool from "../get/list-children.js";

// Named so alphabetical order is unambiguous and independent of any other content.
const ALPHA = "_Test SortByField Alpha";
const ZULU = "_Test SortByField Zulu";

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
});
