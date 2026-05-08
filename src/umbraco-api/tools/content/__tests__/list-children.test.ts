import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initContentTestState,
  ContentBuilder,
  ContentTestHelper,
} from "./setup.js";
import { encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import listChildrenTool from "../get/list-children.js";

const TEST_PAGE_NAME = "_Test List Children";

describe("list-children", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;
  let testDocumentTypeId: string;
  let createdId: string | undefined;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testPageId = state.testPageId;
    testDocumentTypeId = state.testDocumentTypeId;

    // Create a child page so we have known data to find
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();
    createdId = doc.getId();
  }, 60000);

  afterAll(async () => {
    if (createdId) {
      await ContentTestHelper.cleanupById(createdId);
    }
  }, 30000);

  it("should return children including the created page", async () => {
    const result = await listChildrenTool.handler({ parentId: testPageId }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe("number");
    expect(data.total).toBeGreaterThan(0);

    // Verify our created page appears in the list
    const found = data.items.find((item: any) => item.id === createdId);
    expect(found).toBeDefined();
    expect(found.name).toContain(TEST_PAGE_NAME);
  }, 30000);

  it("should accept cursor parameter", async () => {
    const result = await listChildrenTool.handler(
      { parentId: testPageId, cursor: encodeCursor({ s: 0, t: 100 }) },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.total).toBe("number");
  }, 30000);
});
