import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { initContentTestState } from "../../content/__tests__/setup.js";
import auditPageContentTool from "../get/audit-page-content.js";

const TEST_PAGE_NAME = "_Test Audit Content";

describe("audit-page-content", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let createdId: string | undefined;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME)
      .withDocumentType(state.testDocumentTypeId)
      .withParent(state.testPageId)
      .create();
    createdId = doc.getId();
  }, 60000);

  afterAll(async () => {
    if (createdId) await ContentTestHelper.cleanupById(createdId);
  }, 30000);

  it("should audit content body and meta for the created page", async () => {
    const result = await auditPageContentTool.handler(
      { id: createdId! },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.id).toBe(createdId);
    expect(typeof data.bodyContent).toBe("string");
    expect(typeof data.bodyWordCount).toBe("number");
    expect(typeof data.hasMetaDescription).toBe("boolean");
    expect(typeof data.lastModified).toBe("string");
  }, 30000);
});
