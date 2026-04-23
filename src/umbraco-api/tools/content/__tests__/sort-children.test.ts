import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initContentTestState,
  ContentBuilder,
  ContentTestHelper,
} from "./setup.js";
import sortChildrenTool from "../put/sort-children.js";
import listChildrenTool from "../get/list-children.js";

const A = "_Test Sort Children A";
const B = "_Test Sort Children B";

describe("sort-children", () => {
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

  it("reorders two sibling pages", async () => {
    const first = await new ContentBuilder()
      .withName(A)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    createdIds.push(first.getId());

    const second = await new ContentBuilder()
      .withName(B)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    createdIds.push(second.getId());

    // Put B before A (swap the default creation order)
    const result = await sortChildrenTool.handler(
      {
        parentId: testParentId,
        sorting: [
          { id: second.getId(), sortOrder: 0 },
          { id: first.getId(), sortOrder: 1 },
        ],
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.sorted).toBe(2);

    const listResult = await listChildrenTool.handler({ parentId: testParentId }, extra);
    const listData = getStructuredContent(listResult) as any;
    const ordered = listData.items
      .filter((i: any) => i.id === first.getId() || i.id === second.getId())
      .map((i: any) => i.id);
    expect(ordered).toEqual([second.getId(), first.getId()]);
  }, 60000);
});
