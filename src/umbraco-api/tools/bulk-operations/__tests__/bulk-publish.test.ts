import { describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initBulkOperationsTestState,
  createElicitation,
  expectElicitationCancel,
  BulkOperationsTestHelper,
} from "./setup.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import bulkPublishTool from "../post/bulk-publish.js";
import { expectPublished } from "../../../../testing/state-assertions.js";

const elicitation = createElicitation();

describe("bulk-publish", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let firstRootPageId: string;
  let blogPageId: string;
  let articleDocTypeId: string;
  let articleSeedValues: Array<{ alias: string; value: unknown; culture: string | null; segment: string | null }>;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const state = await initBulkOperationsTestState(extra);
    firstRootPageId = state.firstRootPageId;
    blogPageId = state.blogPageId;
    articleDocTypeId = state.articleDocTypeId;
    articleSeedValues = state.articleSeedValues;
  }, 60000);

  afterAll(async () => {
    for (const id of createdIds.reverse()) {
      await BulkOperationsTestHelper.deletePage(id);
    }
    elicitation.cleanup();
  }, 60000);

  beforeEach(() => {
    elicitation.reset();
  });

  it("should return error when more than 10 IDs are provided", async () => {
    const tooManyIds = Array.from(
      { length: 11 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    );

    const result = await bulkPublishTool.handler(
      { ids: tooManyIds, includeDescendants: false },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data.message).toContain("10");
  }, 10000);

  it("should return error when empty array is provided", async () => {
    let errorCaught = false;
    try {
      const result = await bulkPublishTool.handler(
        { ids: [] as any, includeDescendants: false },
        extra,
      );
      const data = getStructuredContent(result) as any;
      expect(data.message).toBeDefined();
      errorCaught = true;
    } catch {
      errorCaught = true;
    }
    expect(errorCaught).toBe(true);
  }, 10000);

  it("should bulk publish multiple pages", async () => {
    // Seed the required article fields (articleDate, author, etc.) from an
    // existing Clean article — without them, publish-document returns
    // ContentInvalid for missing required properties.
    const article1Builder = new ContentBuilder()
      .withName("_Test Bulk Publish 1")
      .withDocumentType(articleDocTypeId)
      .withParent(blogPageId);
    for (const v of articleSeedValues) article1Builder.withValue(v.alias, v.value, v.culture, v.segment);
    const article1 = await article1Builder.create();
    createdIds.push(article1.getId());

    const article2Builder = new ContentBuilder()
      .withName("_Test Bulk Publish 2")
      .withDocumentType(articleDocTypeId)
      .withParent(blogPageId);
    for (const v of articleSeedValues) article2Builder.withValue(v.alias, v.value, v.culture, v.segment);
    const article2 = await article2Builder.create();
    createdIds.push(article2.getId());

    const result = await bulkPublishTool.handler(
      { ids: [article1.getId(), article2.getId()], includeDescendants: false },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.successCount).toBe(2);
    expect(data.failureCount).toBe(0);
    await expectPublished(article1.getId(), extra);
    await expectPublished(article2.getId(), extra);
  }, 60000);

  it("should cancel when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      bulkPublishTool.handler(
        { ids: [firstRootPageId], includeDescendants: false },
        extra,
      ),
    );
  }, 30000);
});
