import { describe, it, expect, beforeAll, afterAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initContentTestState,
  ContentBuilder,
  ContentTestHelper,
  NON_EXISTENT_UUID,
  extractChainedResult,
} from "./setup.js";
import { encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import reportPageReferencesTool from "../get/report-page-references.js";
import {
  ensureReferenceFixture,
  teardownReferenceFixture,
  type ReferenceFixture,
} from "./helpers/reference-fixture.js";

const TEST_PAGE_NAME = "_Test Refs Page";
const SOURCE_PAGE_NAME = "_Test Refs Source";

describe("report-page-references", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testParentId: string;
  let testDocumentTypeId: string;
  let fixture: ReferenceFixture;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testParentId = state.testPageId;
    testDocumentTypeId = state.testDocumentTypeId;
    fixture = await ensureReferenceFixture();
  }, 120000);

  afterEach(async () => {
    while (createdIds.length > 0) {
      const id = createdIds.pop()!;
      await ContentTestHelper.cleanupById(id);
    }
  }, 60000);

  afterAll(async () => {
    await teardownReferenceFixture();
  }, 30000);

  it("returns zero references for a freshly created page", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    createdIds.push(doc.getId());

    const result = await reportPageReferencesTool.handler(
      { id: doc.getId() },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.total).toBe(0);
    expect(data.items).toEqual([]);
  }, 60000);

  it("lists a source page that references the target via a content picker", async () => {
    const target = await new ContentBuilder()
      .withName(TEST_PAGE_NAME + " Target")
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    createdIds.push(target.getId());

    const sourceCreate = await mcpClientManager.callTool("cms", "create-document", {
      documentTypeId: fixture.docTypeId,
      name: SOURCE_PAGE_NAME,
      values: [
        {
          editorAlias: "Umbraco.ContentPicker",
          culture: null,
          segment: null,
          alias: "refPage",
          value: fixture.buildContentPickerValue(target.getId()),
        },
      ],
    });
    if (sourceCreate.isError) {
      throw new Error(
        `Failed to create source page: ${JSON.stringify(extractChainedResult(sourceCreate))}`,
      );
    }
    const sourceId = extractChainedResult(sourceCreate).id as string;
    createdIds.push(sourceId);

    const result = await reportPageReferencesTool.handler({ id: target.getId() }, extra);
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;

    expect(data.total).toBeGreaterThanOrEqual(1);
    const match = data.items.find((item: any) => item.id === sourceId);
    expect(match).toBeDefined();
    expect(match.kind).toBe("document");
    expect(match.name).toBe(SOURCE_PAGE_NAME);
  }, 120000);

  it("returns an error for a non-existent page ID", async () => {
    const result = await reportPageReferencesTool.handler(
      { id: NON_EXISTENT_UUID },
      extra,
    );

    expect(result.isError).toBeTruthy();
  }, 30000);

  it("threads pagination through the chained cursor call without error", async () => {
    // Regression: chained call used to pass raw skip/take to get-document-by-id-referenced-by,
    // which expects a cursor. If cursor encoding is wrong the chained call errors.
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME + " Paged")
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    createdIds.push(doc.getId());

    const result = await reportPageReferencesTool.handler(
      { id: doc.getId(), cursor: encodeCursor({ s: 0, t: 1 }) },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toHaveProperty("total");
    expect(Array.isArray(data.items)).toBe(true);
  }, 60000);
});
