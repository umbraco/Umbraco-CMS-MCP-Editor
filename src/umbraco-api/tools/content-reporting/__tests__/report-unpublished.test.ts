import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "./setup.js";
import { ContentBuilder } from "../../content/__tests__/helpers/content-builder.js";
import { ContentTestHelper } from "../../content/__tests__/helpers/content-test-helper.js";
import { initContentTestState } from "../../content/__tests__/setup.js";
import reportUnpublishedTool from "../get/report-unpublished.js";

const TEST_PAGE_NAME = "_Test Report Unpublished";

describe("report-unpublished", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let createdId: string | undefined;
  let parentId: string | undefined;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    parentId = state.testPageId;
    // Create a draft page (not published) — the report should find it
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

  it("should return unpublished content items including the created draft", async () => {
    // Scope to the parent page we seeded into — the tool walks children of
    // the given parent, so the root-level scan (parentId: undefined) wouldn't
    // see the draft we created as a child of the root.
    const result = await reportUnpublishedTool.handler(
      { parentId },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(Array.isArray(data.items)).toBe(true);
    expect(typeof data.scannedPages).toBe("number");
    expect(typeof data.total).toBe("number");

    const found = data.items.find((item: any) => item.id === createdId);
    expect(found).toBeDefined();
    expect(found).toHaveProperty("id");
    expect(found).toHaveProperty("name");
    expect(found).toHaveProperty("state");
    expect(found.state).not.toBe("Published");
  }, 30000);
});
