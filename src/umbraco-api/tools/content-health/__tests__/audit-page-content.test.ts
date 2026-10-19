import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { initContentTestState } from "../../content/__tests__/setup.js";
import { createBlockListFixture, type BlockListFixture } from "../../content/__tests__/helpers/block-fixture.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
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
    // Regression guard for #233: a draft-only page has no resolvable route.
    expect(data.url).toBe("");
  }, 30000);
});

describe("audit-page-content – published URL (regression for #233)", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let publishedId: string | undefined;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    const doc = await new ContentBuilder()
      .withName("_Test Audit Content Published")
      .withDocumentType(state.testDocumentTypeId)
      .withParent(state.testPageId)
      .create();
    await doc.publish();
    publishedId = doc.getId();
  }, 60000);

  afterAll(async () => {
    if (publishedId) await ContentTestHelper.cleanupById(publishedId);
  }, 30000);

  it("returns a real published URL for a published page", async () => {
    const result = await callTool(auditPageContentTool, { id: publishedId! }, extra);
    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;

    expect(typeof data.url).toBe("string");
    expect(data.url.length).toBeGreaterThan(0);
  }, 30000);
});

describe("audit-page-content – block extraction (regression)", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let fixture: BlockListFixture | null = null;

  beforeAll(async () => {
    fixture = await createBlockListFixture(extra, "_Test audit-page-content block extract");
  }, 120000);

  afterAll(async () => {
    if (fixture) await fixture.cleanup();
  }, 30000);

  it("extracts text from BlockList contentData values into bodyContent", async () => {
    if (!fixture) {
      // No BlockList donor available on this instance — skip gracefully.
      return;
    }

    // The fixture page has a seeded block with value "_seeded block value"
    const result = await callTool(auditPageContentTool, { id: fixture.pageId }, extra);

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;

    // bodyContent must include text extracted from inside the block
    expect(data.bodyContent).toContain("_seeded block value");
    expect(data.bodyWordCount).toBeGreaterThan(0);
  }, 60000);
});
