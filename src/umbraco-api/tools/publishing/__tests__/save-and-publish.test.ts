/**
 * save-and-publish Integration Tests
 *
 * Tests for the save-and-publish POST tool in the publishing collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  createElicitation,
} from "./setup.js";
import {
  ContentBuilder,
  ContentTestHelper,
  initContentTestState,
} from "../../content/__tests__/setup.js";
import saveAndPublishTool, { mergeValues } from "../post/save-and-publish.js";
import editPageTool from "../../content/put/edit-page.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { expectPublished } from "../../../../testing/state-assertions.js";
import { chainCms } from "../../../cms-chain.js";

const TEST_PAGE_NAME_WITH_VALUES = "_Test Save Publish With Values";
const TEST_PAGE_NAME_NO_VALUES = "_Test Save Publish No Values";
const TEST_PAGE_NAME_MERGE = "_Test Save Publish Merge";
const TEST_PAGE_NAME_DESC_PARENT = "_Test Save Publish Desc Parent";

/** Read a single property value straight off the document (draft state). */
async function readValue(id: string, alias: string): Promise<unknown> {
  const result = await chainCms("get-document-by-id", { id });
  if (!result.ok) throw new Error(`Failed to read document ${id}`);
  return result.data.values?.find((v) => v.alias === alias)?.value;
}

const elicitation = createElicitation();

describe("save-and-publish mergeValues", () => {
  it("overwrites matching values and keeps the rest", () => {
    const current = [
      { alias: "title", value: "old title", culture: null, segment: null },
      { alias: "subtitle", value: "keep me", culture: null, segment: null },
    ];

    expect(mergeValues(current, [{ alias: "title", value: "new title" }])).toEqual([
      { alias: "title", value: "new title", culture: null, segment: null },
      { alias: "subtitle", value: "keep me", culture: null, segment: null },
    ]);
  });

  it("appends values the document does not have yet", () => {
    const current = [{ alias: "title", value: "old title", culture: null, segment: null }];

    expect(mergeValues(current, [{ alias: "subtitle", value: "brand new" }])).toEqual([
      { alias: "title", value: "old title", culture: null, segment: null },
      { alias: "subtitle", value: "brand new", culture: null, segment: null },
    ]);
  });

  it("matches on alias + culture + segment, not alias alone", () => {
    const current = [
      { alias: "title", value: "en title", culture: "en-US", segment: null },
      { alias: "title", value: "da title", culture: "da-DK", segment: null },
    ];

    expect(mergeValues(current, [{ alias: "title", value: "new da", culture: "da-DK" }])).toEqual([
      { alias: "title", value: "en title", culture: "en-US", segment: null },
      { alias: "title", value: "new da", culture: "da-DK", segment: null },
    ]);
  });

  it("drops editorAlias from the document's values", () => {
    const current = [
      { alias: "title", value: "old", culture: null, segment: null, editorAlias: "Umbraco.TextBox" },
    ];

    expect(mergeValues(current, [])).toEqual([
      { alias: "title", value: "old", culture: null, segment: null },
    ]);
  });

  it("returns the document's values unchanged when nothing is incoming", () => {
    const current = [{ alias: "title", value: "old", culture: null, segment: null }];
    expect(mergeValues(current, [])).toEqual(current);
  });
});

describe("save-and-publish", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testParentId: string;
  let testDocumentTypeId: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testParentId = state.testPageId;
    testDocumentTypeId = state.testDocumentTypeId;
  }, 60000);

  beforeEach(() => { elicitation.reset(); });

  afterEach(async () => {
    // Clean up deepest-first so children go before their parents.
    while (createdIds.length) {
      const id = createdIds.pop()!;
      await ContentTestHelper.cleanupById(id);
    }
  }, 60000);

  afterAll(() => { elicitation.cleanup(); });

  it("saves values and publishes in one call", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME_WITH_VALUES)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    createdIds.push(doc.getId());

    const result = await callTool(
      saveAndPublishTool,
      {
        id: doc.getId(),
        values: [{ alias: "title", value: "Save And Publish Title" }],
        includeDescendants: false,
      },
      extra,
    );

    expect(createSnapshotResult(result, doc.getId())).toMatchSnapshot();
    expect(await readValue(doc.getId(), "title")).toBe("Save And Publish Title");
    await expectPublished(doc.getId(), extra);
  }, 60000);

  it("publishes without values when none provided", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME_NO_VALUES)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    createdIds.push(doc.getId());

    await callTool(
      editPageTool,
      { id: doc.getId(), values: [{ alias: "title", value: "Pre-edited Title" }] },
      extra,
    );

    const result = await callTool(
      saveAndPublishTool,
      { id: doc.getId(), values: undefined, includeDescendants: false },
      extra,
    );

    expect(createSnapshotResult(result, doc.getId())).toMatchSnapshot();
    expect(await readValue(doc.getId(), "title")).toBe("Pre-edited Title");
    await expectPublished(doc.getId(), extra);
  }, 60000);

  // The non-descendants path uses the atomic `update-and-publish-document` CMS
  // tool, which is a FULL-REPLACE PUT — whatever it is sent becomes the
  // document's complete value set. Sending only the caller's partial `values`
  // would wipe every other property, so the handler merges them into the
  // document's current values first. This test is the guard on that merge.
  it("keeps untouched property values when saving a single property", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME_MERGE)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .withValue("title", "Merge Title Before")
      .withValue("subtitle", "Merge Subtitle Untouched")
      .create();
    createdIds.push(doc.getId());

    // Sanity check the seed actually landed — the merge assertion below is
    // meaningless if `subtitle` was never set in the first place.
    expect(await readValue(doc.getId(), "subtitle")).toBe("Merge Subtitle Untouched");

    const result = await callTool(
      saveAndPublishTool,
      {
        id: doc.getId(),
        values: [{ alias: "title", value: "Merge Title After" }],
        includeDescendants: false,
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    expect(await readValue(doc.getId(), "title")).toBe("Merge Title After");
    // The property the caller never mentioned must survive the full-replace PUT.
    expect(await readValue(doc.getId(), "subtitle")).toBe("Merge Subtitle Untouched");
    await expectPublished(doc.getId(), extra);
  }, 60000);

  // The descendants branch is deliberately NOT ported to the atomic call —
  // `update-and-publish-document` has no includeDescendants equivalent, so it
  // keeps the two-call `update-document-properties` + `publish-document-with-descendants`
  // sequence. (Exercised on a leaf page: the test document type allows no
  // children, so a real subtree can't be created portably.)
  it("saves values and publishes descendants when includeDescendants is set", async () => {
    const parent = await new ContentBuilder()
      .withName(TEST_PAGE_NAME_DESC_PARENT)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .withValue("subtitle", "Descendants Subtitle Untouched")
      .create();
    createdIds.push(parent.getId());

    const result = await callTool(
      saveAndPublishTool,
      {
        id: parent.getId(),
        values: [{ alias: "title", value: "Descendants Title" }],
        includeDescendants: true,
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    expect(createSnapshotResult(result, parent.getId())).toMatchSnapshot();
    expect(await readValue(parent.getId(), "title")).toBe("Descendants Title");
    expect(await readValue(parent.getId(), "subtitle")).toBe("Descendants Subtitle Untouched");
    await expectPublished(parent.getId(), extra);
  }, 90000);

  it("cancels when the descendants confirmation is declined", async () => {
    elicitation.rejectAll();

    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME_DESC_PARENT)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    createdIds.push(doc.getId());

    const result = await callTool(
      saveAndPublishTool,
      {
        id: doc.getId(),
        values: [{ alias: "title", value: "Never Saved" }],
        includeDescendants: true,
      },
      extra,
    );

    const data = result.structuredContent as {
      saved: boolean;
      published: boolean;
      message: string;
    };
    expect(data.message).toContain("cancelled");
    expect(data.saved).toBe(false);
    expect(data.published).toBe(false);
    expect(await readValue(doc.getId(), "title")).not.toBe("Never Saved");
  }, 60000);
});
