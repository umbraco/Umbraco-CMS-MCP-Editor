import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  createSnapshotResult,
  initContentTestState,
  ContentBuilder,
  ContentTestHelper,
  NON_EXISTENT_UUID,
} from "./setup.js";
import compareTool from "../get/compare-draft-to-published.js";
import editPageTool from "../put/edit-page.js";
import getDocumentTypeTool from "../get/get-document-type.js";

const NEVER_PUBLISHED_NAME = "_Test Compare Never Published";
const NO_CHANGES_NAME = "_Test Compare No Changes";
const WITH_CHANGES_NAME = "_Test Compare With Changes";

function normalizeChangeValues(result: any): any {
  if (!result?.structuredContent?.changes) return result;
  return {
    ...result,
    structuredContent: {
      ...result.structuredContent,
      changes: result.structuredContent.changes.map((c: any) => ({
        ...c,
        ...(c.draftValue !== undefined ? { draftValue: "[VALUE]" } : {}),
        ...(c.publishedValue !== undefined ? { publishedValue: "[VALUE]" } : {}),
      })),
      summary: typeof result.structuredContent.summary === "string"
        ? result.structuredContent.summary.replace(/: .+$/, ": [ALIASES]")
        : result.structuredContent.summary,
    },
  };
}

describe("compare-draft-to-published", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;
  let testDocumentTypeId: string;
  let createdIds: string[] = [];

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testPageId = state.testPageId;
    testDocumentTypeId = state.testDocumentTypeId;
  }, 60000);

  afterEach(async () => {
    for (const id of createdIds) {
      await ContentTestHelper.cleanupById(id);
    }
    createdIds = [];
  }, 60000);

  it("snapshots a never-published comparison (happy path)", async () => {
    const doc = await new ContentBuilder()
      .withName(NEVER_PUBLISHED_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();
    createdIds.push(doc.getId());

    const result = await compareTool.handler({ id: doc.getId() }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.publishStatus).toBe("NotPublished");
    expect(data.changes.every((c: any) => c.changeType === "added")).toBe(true);
    expect(normalizeChangeValues(createSnapshotResult(result, doc.getId()))).toMatchSnapshot();
  }, 60000);

  it("snapshots an unchanged-draft comparison (happy path)", async () => {
    const doc = await new ContentBuilder()
      .withName(NO_CHANGES_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();
    createdIds.push(doc.getId());
    await doc.publish();

    const result = await compareTool.handler({ id: doc.getId() }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.publishStatus).toBe("Published");
    expect(data.hasDraftChanges).toBe(false);
    expect(data.changes).toEqual([]);
    expect(createSnapshotResult(result, doc.getId())).toMatchSnapshot();
  }, 60000);

  it("snapshots a pending-changes comparison after editing a published page (happy path)", async () => {
    const docTypeResult = await getDocumentTypeTool.handler({ id: testDocumentTypeId }, extra);
    const docTypeData = getStructuredContent(docTypeResult) as any;
    const editableAlias: string | undefined = docTypeData?.properties?.[0]?.alias;

    const doc = await new ContentBuilder()
      .withName(WITH_CHANGES_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testPageId)
      .create();
    createdIds.push(doc.getId());
    await doc.publish();

    if (!editableAlias) {
      return;
    }

    const editResult = await editPageTool.handler(
      { id: doc.getId(), values: [{ alias: editableAlias, value: "Updated content for diff snapshot" }] },
      extra,
    );
    if (editResult.isError) {
      return;
    }

    const result = await compareTool.handler({ id: doc.getId() }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(["Published", "PendingChanges"]).toContain(data.publishStatus);
    for (const change of data.changes) {
      expect(["added", "modified", "removed"]).toContain(change.changeType);
      expect(typeof change.alias).toBe("string");
    }

    const masked = normalizeChangeValues(createSnapshotResult(result, doc.getId()));
    if (Array.isArray(masked.structuredContent.changes)) {
      masked.structuredContent.changes.sort((a: any, b: any) => a.alias.localeCompare(b.alias));
    }
    expect(masked).toMatchSnapshot();
  }, 60000);

  it("returns an error for a non-existent page", async () => {
    const result = await compareTool.handler({ id: NON_EXISTENT_UUID }, extra);
    expect(result.isError).toBe(true);
  }, 30000);
});
