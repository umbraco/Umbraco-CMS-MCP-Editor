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
import bulkUnpublishTool from "../post/bulk-unpublish.js";
import bulkPublishTool from "../post/bulk-publish.js";
import { expectUnpublished } from "../../../../testing/state-assertions.js";
import { withHumanInTheLoopBlocking } from "../../../../testing/human-in-the-loop-test-helper.js";

const elicitation = createElicitation();

describe("bulk-unpublish", () => {
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

  it("should bulk unpublish multiple pages", async () => {
    // Create and publish two articles. Seed required article fields so the
    // publish API doesn't reject them with ContentInvalid (articleDate, author).
    const article1Builder = new ContentBuilder()
      .withName("_Test Bulk Unpublish 1")
      .withDocumentType(articleDocTypeId)
      .withParent(blogPageId);
    for (const v of articleSeedValues) article1Builder.withValue(v.alias, v.value, v.culture, v.segment);
    const article1 = await article1Builder.create();
    createdIds.push(article1.getId());

    const article2Builder = new ContentBuilder()
      .withName("_Test Bulk Unpublish 2")
      .withDocumentType(articleDocTypeId)
      .withParent(blogPageId);
    for (const v of articleSeedValues) article2Builder.withValue(v.alias, v.value, v.culture, v.segment);
    const article2 = await article2Builder.create();
    createdIds.push(article2.getId());

    // Publish them first
    await bulkPublishTool.handler(
      { ids: [article1.getId(), article2.getId()], includeDescendants: false },
      extra,
    );
    elicitation.reset();

    // Now unpublish both
    const result = await bulkUnpublishTool.handler(
      { ids: [article1.getId(), article2.getId()] },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.successCount).toBe(2);
    expect(data.failureCount).toBe(0);
    await expectUnpublished(article1.getId(), extra);
    await expectUnpublished(article2.getId(), extra);
  }, 60000);

  it("should cancel when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      bulkUnpublishTool.handler(
        { ids: [firstRootPageId] },
        extra,
      ),
    );
  }, 30000);

  it("blocks bulk-unpublish when the human-in-the-loop gate is enabled, before touching the CMS", async () => {
    await withHumanInTheLoopBlocking(async () => {
      const result = await bulkUnpublishTool.handler(
        { ids: ["00000000-0000-0000-0000-000000000000"] },
        extra,
      );
      expect(result.isError).toBe(true);
      expect(getStructuredContent(result)).toEqual(
        expect.objectContaining({ status: 403, title: expect.stringContaining("blocked") }),
      );
    });
  }, 30000);
});
