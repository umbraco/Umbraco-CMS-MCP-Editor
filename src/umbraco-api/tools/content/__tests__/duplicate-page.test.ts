import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  getStructuredContent,
  initContentTestState,
  ContentBuilder,
  ContentTestHelper,
} from "./setup.js";
import duplicatePageTool from "../post/duplicate-page.js";

const TEST_PAGE_NAME = "_Test Duplicate Source";
const NORMALIZED_UUID = "00000000-0000-0000-0000-000000000000";

/** Normalise both `id` (new copy) and `sourceId` in the duplicate-page response so snapshots are stable. */
function normaliseDuplicateResult(result: any, newId: string, sourceId: string) {
  const normalised = createSnapshotResult(result, newId);
  if (normalised?.structuredContent?.sourceId === sourceId) {
    normalised.structuredContent.sourceId = NORMALIZED_UUID;
  }
  return normalised;
}

describe("duplicate-page", () => {
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

  it("duplicates a page under the same parent", async () => {
    const source = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    createdIds.push(source.getId());

    const result = await duplicatePageTool.handler(
      {
        id: source.getId(),
        targetParentId: testParentId,
        includeDescendants: false,
        relateToOriginal: false,
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    createdIds.push(data.id);
    expect(data.id).not.toBe(source.getId());

    expect(normaliseDuplicateResult(result, data.id, source.getId())).toMatchSnapshot();
  }, 60000);

  it("returns an error for a non-existent source ID", async () => {
    const result = await duplicatePageTool.handler(
      {
        id: "00000000-0000-0000-0000-000000000001",
        targetParentId: testParentId,
        includeDescendants: false,
        relateToOriginal: false,
      },
      extra,
    );

    expect(result.isError).toBeTruthy();
  }, 30000);
});
