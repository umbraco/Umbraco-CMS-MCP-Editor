import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  getStructuredContent,
  initRelationshipsTestState,
} from "./setup.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { initContentTestState } from "../../content/__tests__/setup.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import {
  ensureReferenceFixture,
  teardownReferenceFixture,
  type ReferenceFixture,
} from "../../content/__tests__/helpers/reference-fixture.js";
import reportContentReferencesTool from "../get/report-content-references.js";

describe("report-content-references", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;
  let testMediaId: string;

  beforeAll(async () => {
    const state = await initRelationshipsTestState(extra);
    testPageId = state.testPageId;
    testMediaId = state.testMediaId;
  }, 60000);

  it("should return referencedBy array and referenceCount for a known page", async () => {
    const result = await reportContentReferencesTool.handler(
      { id: testPageId, type: "document" },
      extra,
    );

    expect(createSnapshotResult(result, testPageId)).toMatchSnapshot();
  }, 30000);

  it("should return referencedBy and referenceCount for a media item", async () => {
    const result = await reportContentReferencesTool.handler(
      { id: testMediaId, type: "media" },
      extra,
    );

    expect(createSnapshotResult(result, testMediaId)).toMatchSnapshot();
  }, 30000);
});

describe("report-content-references – published URL (regression for #233)", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let draftId: string | undefined;
  let publishedId: string | undefined;

  beforeAll(async () => {
    const state = await initContentTestState(extra);

    const draftDoc = await new ContentBuilder()
      .withName("_Test Content References Draft")
      .withDocumentType(state.testDocumentTypeId)
      .withParent(state.testPageId)
      .create();
    draftId = draftDoc.getId();

    const publishedDoc = await new ContentBuilder()
      .withName("_Test Content References Published")
      .withDocumentType(state.testDocumentTypeId)
      .withParent(state.testPageId)
      .create();
    await publishedDoc.publish();
    publishedId = publishedDoc.getId();
  }, 60000);

  afterAll(async () => {
    if (draftId) await ContentTestHelper.cleanupById(draftId);
    if (publishedId) await ContentTestHelper.cleanupById(publishedId);
  }, 30000);

  it("returns '' for a draft-only page", async () => {
    const result = await reportContentReferencesTool.handler({ id: draftId!, type: "document" }, extra);
    const data = getStructuredContent(result) as any;
    expect(data.url).toBe("");
  }, 30000);

  it("returns a real published URL for a published page", async () => {
    const result = await reportContentReferencesTool.handler({ id: publishedId!, type: "document" }, extra);
    const data = getStructuredContent(result) as any;
    expect(typeof data.url).toBe("string");
    expect(data.url.length).toBeGreaterThan(0);
  }, 30000);
});

describe("report-content-references – referencedBy[].url mapping (#239)", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let fixture: ReferenceFixture;
  let targetId: string | undefined;
  let sourceId: string | undefined;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    fixture = await ensureReferenceFixture();

    const target = await new ContentBuilder()
      .withName("_Test 239 Referenced Target")
      .withDocumentType(state.testDocumentTypeId)
      .withParent(state.testPageId)
      .create();
    await target.publish();
    targetId = target.getId();

    const sourceCreate = await mcpClientManager.callTool("cms", "create-document", {
      documentTypeId: fixture.docTypeId,
      name: "_Test 239 Referencing Source",
      values: [
        {
          editorAlias: "Umbraco.ContentPicker",
          culture: null,
          segment: null,
          alias: "refPage",
          value: fixture.buildContentPickerValue(targetId),
        },
      ],
    });
    if (sourceCreate.isError) {
      throw new Error(
        `Failed to create referencing source page: ${JSON.stringify(extractChainedResult(sourceCreate))}`,
      );
    }
    sourceId = extractChainedResult(sourceCreate).id as string;

    const publishResult = await mcpClientManager.callTool("cms", "publish-document", {
      id: sourceId,
      data: { publishSchedules: [{ culture: null }] },
    });
    if (publishResult.isError) {
      throw new Error(
        `Failed to publish referencing source page: ${JSON.stringify(extractChainedResult(publishResult))}`,
      );
    }
  }, 120000);

  afterAll(async () => {
    if (sourceId) await ContentTestHelper.cleanupById(sourceId);
    if (targetId) await ContentTestHelper.cleanupById(targetId);
    await teardownReferenceFixture();
  }, 60000);

  it("includes the referencing page in referencedBy with its real published URL", async () => {
    const result = await reportContentReferencesTool.handler({ id: targetId!, type: "document" }, extra);
    expect(result.isError).toBeFalsy();

    const data = getStructuredContent(result) as any;
    expect(data.referenceCount).toBeGreaterThanOrEqual(1);

    const match = data.referencedBy.find((ref: any) => ref.id === sourceId);
    expect(match).toBeDefined();
    expect(match.name).toBe("_Test 239 Referencing Source");
    expect(typeof match.url).toBe("string");
    expect(match.url.length).toBeGreaterThan(0);
  }, 60000);
});
