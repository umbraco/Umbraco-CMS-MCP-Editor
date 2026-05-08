import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initBulkOperationsTestState,
  createElicitation,
  expectElicitationCancel,
  BulkOperationsTestHelper,
  FAKE_TARGET_UUID,
} from "./setup.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import bulkMoveTool from "../post/bulk-move.js";

const elicitation = createElicitation();

describe("bulk-move", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let firstRootPageId: string;
  let secondRootPageId: string | undefined;
  let blogPageId: string;
  let blogDocTypeId: string;
  let articleDocTypeId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const state = await initBulkOperationsTestState(extra);
    firstRootPageId = state.firstRootPageId;
    secondRootPageId = state.secondRootPageId;
    blogPageId = state.blogPageId;
    blogDocTypeId = state.blogDocTypeId;
    articleDocTypeId = state.articleDocTypeId;
  }, 60000);

  afterAll(async () => {
    // Clean up in reverse order (articles first, then container)
    for (const id of createdIds.reverse()) {
      await BulkOperationsTestHelper.deletePage(id);
    }
    elicitation.cleanup();
  }, 60000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should bulk move articles to a new blog container", async () => {
    // Create a second blog container under the home page
    const targetBlog = await new ContentBuilder()
      .withName("_Test Target Blog")
      .withDocumentType(blogDocTypeId)
      .withParent(firstRootPageId)
      .create();
    createdIds.push(targetBlog.getId());

    // Create two articles under the existing blog
    const article1 = await new ContentBuilder()
      .withName("_Test Move Article 1")
      .withDocumentType(articleDocTypeId)
      .withParent(blogPageId)
      .create();
    createdIds.push(article1.getId());

    const article2 = await new ContentBuilder()
      .withName("_Test Move Article 2")
      .withDocumentType(articleDocTypeId)
      .withParent(blogPageId)
      .create();
    createdIds.push(article2.getId());

    // Bulk move both articles into the new blog container
    const result = await bulkMoveTool.handler(
      { ids: [article1.getId(), article2.getId()], targetParentId: targetBlog.getId() },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.successCount).toBe(2);
    expect(data.failureCount).toBe(0);
  }, 60000);

  it("should reject move when elicitation is rejected (with real pages)", async () => {
    elicitation.rejectAll();

    const result = await bulkMoveTool.handler(
      { ids: [firstRootPageId], targetParentId: secondRootPageId! },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
  }, 30000);

  it("should cancel when elicitation is rejected (with fake target)", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      bulkMoveTool.handler(
        { ids: [firstRootPageId], targetParentId: FAKE_TARGET_UUID },
        extra,
      ),
    );
  }, 30000);

  it("surfaces upstream errors as a parsed object, not as escaped JSON", async () => {
    // Create a real page to use as the move source.
    const page = await new ContentBuilder()
      .withName("_Test Bulk Move Error Page")
      .withDocumentType(articleDocTypeId)
      .withParent(blogPageId)
      .create();
    const pageId = page.getId();
    createdIds.push(pageId);

    // Elicitation accepts by default (reset in beforeEach).
    // Move to a non-existent UUID — the CMS API will reject with a problem-details error.
    const result = await callTool(
      bulkMoveTool,
      { ids: [pageId], targetParentId: FAKE_TARGET_UUID },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;

    const failed = data.results?.find((r: any) => r.success === false);
    expect(failed).toBeDefined();

    // Before the fix: failed.error was a string of escaped JSON.
    // After the fix: it should be a parsed object with structured error fields.
    expect(failed.error).toBeDefined();
    expect(typeof failed.error).toBe("object");
    expect(failed.error).not.toBeNull();

    // The problem-details object should have these fields accessible (proving
    // double-unwrap actually reached the inner structuredContent)
    const errorObj = failed.error as Record<string, any>;
    expect(errorObj.title).toBeDefined();      // e.g., "The targeted content parent could not be found"
    expect(typeof errorObj.title).toBe("string");
    // RFC 7807 problem-details: status and operationStatus confirm full structured unwrap
    expect(errorObj.status).toBeDefined();
    expect(typeof errorObj.status).toBe("number");
  }, 60000);
});
