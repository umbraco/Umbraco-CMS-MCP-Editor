import { describe, it, expect, beforeAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
  initPublishingTestState,
  NON_EXISTENT_UUID,
} from "./setup.js";
import publishPageTool from "../post/publish-page.js";
import { expectPublished } from "../../../../testing/state-assertions.js";

describe("publish-page", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;

  beforeAll(async () => {
    const state = await initPublishingTestState(extra);
    testPageId = state.testPageId;
  }, 60000);

  it("should publish a page", async () => {
    const result = await publishPageTool.handler(
      { id: testPageId, includeDescendants: false },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Published");
    expect(data.id).toBe(testPageId);
    expect(data.name).toEqual(expect.any(String));
    // Regression guard for #233: get-document-by-id's `urls` field is gone in
    // Umbraco 18 — publishedUrls must come from the separate
    // get-document-urls call and must be non-empty for a non-descendants
    // publish of a page with a resolvable route.
    expect(Array.isArray(data.publishedUrls)).toBe(true);
    expect(data.publishedUrls.length).toBeGreaterThan(0);
    expect(typeof data.publishedUrls[0]).toBe("string");
    expect(data.publishedUrls[0].length).toBeGreaterThan(0);

    await expectPublished(testPageId, extra);
  }, 30000);

  it("should return error for non-existent page", async () => {
    const result = await publishPageTool.handler(
      { id: NON_EXISTENT_UUID, includeDescendants: false },
      extra,
    );
    expect(result.isError).toBeTruthy();
  }, 30000);
});
