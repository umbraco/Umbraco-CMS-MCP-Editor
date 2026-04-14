import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  NON_EXISTENT_UUID,
} from "./setup.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { initContentTestState } from "../../content/__tests__/setup.js";
import auditPageSeoTool from "../get/audit-page-seo.js";

const TEST_PAGE_NAME = "_Test Audit SEO";

describe("audit-page-seo", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let createdId: string | undefined;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    // Create a page with known content to audit
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

  it("should return SEO audit for the created page", async () => {
    const result = await auditPageSeoTool.handler({ id: createdId! }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.id).toBe(createdId);
    expect(typeof data.name).toBe("string");
    expect(typeof data.hasTitle).toBe("boolean");
    expect(typeof data.hasMetaDescription).toBe("boolean");
    expect(Array.isArray(data.headings)).toBe(true);
    expect(Array.isArray(data.images)).toBe(true);
    expect(typeof data.bodyWordCount).toBe("number");
  }, 30000);

  it("should return error for non-existent page ID", async () => {
    const result = await auditPageSeoTool.handler(
      { id: NON_EXISTENT_UUID },
      extra,
    );

    expect(result.isError).toBe(true);
  }, 30000);
});
