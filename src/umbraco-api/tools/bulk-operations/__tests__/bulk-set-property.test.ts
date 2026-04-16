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
import bulkSetPropertyTool from "../post/bulk-set-property.js";

const elicitation = createElicitation();

describe("bulk-set-property", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let firstRootPageId: string;
  let blogPageId: string;
  let articleDocTypeId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const state = await initBulkOperationsTestState(extra);
    firstRootPageId = state.firstRootPageId;
    blogPageId = state.blogPageId;
    articleDocTypeId = state.articleDocTypeId;
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

  it("should bulk set a property on multiple pages", async () => {
    const article1 = await new ContentBuilder()
      .withName("_Test Bulk Set Prop 1")
      .withDocumentType(articleDocTypeId)
      .withParent(blogPageId)
      .create();
    createdIds.push(article1.getId());

    const article2 = await new ContentBuilder()
      .withName("_Test Bulk Set Prop 2")
      .withDocumentType(articleDocTypeId)
      .withParent(blogPageId)
      .create();
    createdIds.push(article2.getId());

    const result = await bulkSetPropertyTool.handler(
      {
        ids: [article1.getId(), article2.getId()],
        alias: "title",
        value: "Bulk Test Value",
        culture: undefined,
        segment: undefined,
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data.successCount).toBe(2);
    expect(data.failureCount).toBe(0);
  }, 60000);

  it("should cancel when elicitation is rejected", async () => {
    elicitation.rejectAll();
    await expectElicitationCancel(() =>
      bulkSetPropertyTool.handler(
        {
          ids: [firstRootPageId],
          alias: "title",
          value: "Should Not Be Set",
          culture: undefined,
          segment: undefined,
        },
        extra,
      ),
    );
  }, 30000);
});
