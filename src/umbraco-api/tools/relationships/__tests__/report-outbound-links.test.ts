import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initRelationshipsTestState,
} from "./setup.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { initContentTestState } from "../../content/__tests__/setup.js";
import reportOutboundLinksTool from "../get/report-outbound-links.js";

describe("report-outbound-links", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initRelationshipsTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  it("should return internalPages, media, and externalUrls arrays", async () => {
    const result = await reportOutboundLinksTool.handler(
      { id: testPageId },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.id).toBe(testPageId);
    expect(data.internalPages).toBeInstanceOf(Array);
    expect(data.media).toBeInstanceOf(Array);
    expect(data.externalUrls).toBeInstanceOf(Array);
    expect(data.summary).toBeDefined();
    expect(typeof data.summary.totalLinks).toBe("number");
    expect(typeof data.summary.internalPageCount).toBe("number");
    expect(typeof data.summary.mediaCount).toBe("number");
    expect(typeof data.summary.externalUrlCount).toBe("number");
  }, 60000);
});

describe("report-outbound-links – published URL (regression for #233)", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let draftId: string | undefined;
  let publishedId: string | undefined;

  beforeAll(async () => {
    const state = await initContentTestState(extra);

    const draftDoc = await new ContentBuilder()
      .withName("_Test Outbound Links Draft")
      .withDocumentType(state.testDocumentTypeId)
      .withParent(state.testPageId)
      .create();
    draftId = draftDoc.getId();

    const publishedDoc = await new ContentBuilder()
      .withName("_Test Outbound Links Published")
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

  it("returns '' for the page's own url when draft-only", async () => {
    const result = await reportOutboundLinksTool.handler({ id: draftId! }, extra);
    const data = getStructuredContent(result) as any;
    expect(data.url).toBe("");
  }, 30000);

  it("returns a real published URL for the page's own url once published", async () => {
    const result = await reportOutboundLinksTool.handler({ id: publishedId! }, extra);
    const data = getStructuredContent(result) as any;
    expect(typeof data.url).toBe("string");
    expect(data.url.length).toBeGreaterThan(0);
  }, 30000);
});
