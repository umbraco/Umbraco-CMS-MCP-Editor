/**
 * Integration tests for the `fetchPrimaryPublishedUrl` / `fetchPrimaryPublishedUrlsBatch`
 * helpers added for #233 (Umbraco 18 no longer returns `urls` on
 * get-document-by-id — published URLs come only from get-document-urls).
 *
 * These go through the chained CMS tool (unlike the rest of preview-url.test.ts,
 * which is pure), so they need `setupTestEnvironment()` and a running Umbraco
 * instance — same as any other integration test in this repo.
 */

import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
} from "@umbraco-cms/mcp-server-sdk/testing";
import { v4 as uuid } from "uuid";
import {
  fetchPrimaryPublishedUrl,
  fetchPrimaryPublishedUrlsBatch,
  fetchPublishedUrlsBatch,
} from "../preview-url.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { initContentTestState } from "../../content/__tests__/setup.js";

const NON_EXISTENT_UUID = "00000000-0000-0000-0000-000000000000";

describe("fetchPrimaryPublishedUrl / fetchPrimaryPublishedUrlsBatch", () => {
  setupTestEnvironment();

  // Not strictly needed by these helpers (they don't take `extra`), but keeps
  // this file consistent with the rest of the suite and documents that the
  // CMS chain is live for this describe block.
  createMockRequestHandlerExtra();

  it("returns '' for an id with no resolvable published URL (missing-id case)", async () => {
    const url = await fetchPrimaryPublishedUrl(NON_EXISTENT_UUID);
    expect(url).toBe("");
  }, 30000);

  it("returns an empty map for an empty id list without calling the CMS (empty case)", async () => {
    const map = await fetchPrimaryPublishedUrlsBatch([]);
    expect(map.size).toBe(0);
  });

  it("maps a missing id to '' rather than omitting it from the batch result", async () => {
    const map = await fetchPrimaryPublishedUrlsBatch([NON_EXISTENT_UUID]);
    expect(map.has(NON_EXISTENT_UUID)).toBe(true);
    expect(map.get(NON_EXISTENT_UUID)).toBe("");
  }, 30000);
});

describe("fetchPublishedUrlsBatch — 414 regression (PR #235 review)", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let publishedDoc: ContentBuilder;

  beforeAll(async () => {
    const state = await initContentTestState(extra);

    publishedDoc = await new ContentBuilder()
      .withName("_Test 414 Regression Published")
      .withDocumentType(state.testDocumentTypeId)
      .withParent(state.testPageId)
      .create();
    await publishedDoc.publish();
  }, 60000);

  afterAll(async () => {
    if (publishedDoc) {
      await ContentTestHelper.cleanupById(publishedDoc.getId());
    }
  }, 30000);

  it("still returns the real page's URL when batched alongside ~300 other ids (previously a 414)", async () => {
    const otherIds = Array.from({ length: 300 }, () => uuid());
    const ids = [publishedDoc.getId(), ...otherIds];

    const map = await fetchPublishedUrlsBatch(ids);

    const realUrls = map.get(publishedDoc.getId());
    expect(realUrls).toBeDefined();
    expect(realUrls!.length).toBeGreaterThan(0);
  }, 60000);
});
