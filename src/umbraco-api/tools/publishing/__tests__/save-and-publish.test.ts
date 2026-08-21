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
import { initTranslationTestState } from "../../translation/__tests__/setup.js";
import { VariantDoctypeFixture } from "../../translation/__tests__/helpers/variant-doctype-fixture.js";
import saveAndPublishTool, { mergeValues } from "../post/save-and-publish.js";
import editPageTool from "../../content/put/edit-page.js";
import createVariantTool from "../../translation/post/create-variant.js";
import getPublishStatusTool from "../../scheduling/get/get-publish-status.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { expectPublished } from "../../../../testing/state-assertions.js";
import { chainCms } from "../../../cms-chain.js";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

const TEST_PAGE_NAME_WITH_VALUES = "_Test Save Publish With Values";
const TEST_PAGE_NAME_NO_VALUES = "_Test Save Publish No Values";
const TEST_PAGE_NAME_MERGE = "_Test Save Publish Merge";
const TEST_PAGE_NAME_DESC_PARENT = "_Test Save Publish Desc Parent";
const TEST_PAGE_NAME_ATOMIC = "_Test Save Publish Atomic Failure";

/**
 * Read a single property value straight off the document (draft state).
 *
 * `culture` defaults to null, which is what invariant content carries; pass a
 * culture code to read one variant's value on culture-varying content.
 */
async function readValue(id: string, alias: string, culture: string | null = null): Promise<unknown> {
  const result = await chainCms("get-document-by-id", { id });
  if (!result.ok) throw new Error(`Failed to read document ${id}`);
  return result.data.values?.find(
    (v) => v.alias === alias && (v.culture ?? null) === culture,
  )?.value;
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

  // The handler tells the caller that a failure on the atomic path rolled the
  // field updates back along with the publish. That claim is only safe if
  // `update-and-publish-document` really is all-or-nothing, so force it to fail
  // and check the document is untouched. An alias the document type doesn't have
  // is rejected by Umbraco with PropertyTypeNotFound.
  it("saves nothing when the atomic save-and-publish call fails", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME_ATOMIC)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .withValue("title", "Atomic Title Before")
      .withValue("subtitle", "Atomic Subtitle Before")
      .create();
    createdIds.push(doc.getId());

    // The rollback assertions below are meaningless if the seed never landed.
    expect(await readValue(doc.getId(), "title")).toBe("Atomic Title Before");
    expect(await readValue(doc.getId(), "subtitle")).toBe("Atomic Subtitle Before");

    const result = await callTool(
      saveAndPublishTool,
      {
        id: doc.getId(),
        values: [
          { alias: "title", value: "Atomic Title After" },
          { alias: "_noSuchAliasOnThisDocType", value: "rejected" },
        ],
        includeDescendants: false,
      },
      extra,
    );

    expect(result.isError).toBe(true);
    // The caller must be told the save was rolled back too — a bare publish
    // error would read as "the edits landed, only the publish didn't".
    expect(result.structuredContent).toMatchObject({
      detail: expect.stringContaining("No changes were saved"),
    });
    expect(String((result.structuredContent as { detail?: unknown }).detail)).toContain("atomic");

    // Nothing persisted: neither the valid property alongside the invalid one,
    // nor any other property, nor the rejected alias itself.
    expect(await readValue(doc.getId(), "title")).toBe("Atomic Title Before");
    expect(await readValue(doc.getId(), "subtitle")).toBe("Atomic Subtitle Before");
    expect(await readValue(doc.getId(), "_noSuchAliasOnThisDocType")).toBeUndefined();
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

/**
 * The atomic path against culture-varying content.
 *
 * Every test above runs on an invariant document type, which leaves the
 * variant-specific logic — `culturesToPublish`, the rebuilt `variants` array,
 * and `mergeValues`'s alias+culture+segment keying — unexercised. The Clean
 * starter kit ships no variant doctype, so this block provisions one (a single
 * culture-varying Textstring) and a second language via the translation setup.
 */
describe("save-and-publish (variant content)", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  const variantDocTypeFixture = new VariantDoctypeFixture();
  let variantPageId: string | undefined;
  let defaultCulture: string;
  let secondaryCulture: string;

  beforeAll(async () => {
    const state = await initTranslationTestState(extra);
    defaultCulture = state.defaultCulture;
    secondaryCulture = state.secondaryCulture;

    // Find (never create) the Textstring data type — the property the test
    // writes per-culture values to needs a real editor behind it.
    const dataTypeResult = await mcpClientManager.callTool("cms", "find-data-type", {
      editorAlias: "Umbraco.TextBox",
    });
    const dataTypeId: string | undefined = (extractChainedResult(dataTypeResult) as any)?.items?.[0]?.id;
    if (!dataTypeId) {
      throw new Error("No Textstring (Umbraco.TextBox) data type found on this Umbraco instance");
    }

    // ContentBuilder can't create variant content (it sends culture:null, which
    // Umbraco rejects for variesByCulture doctypes), hence the fixture.
    await variantDocTypeFixture.create({
      properties: [{ name: "Title", alias: "title", dataTypeId, group: "Content" }],
    });
    variantPageId = await variantDocTypeFixture.createPage(
      `_test-save-publish-variant-${Date.now()}`,
      defaultCulture,
    );
  }, 180000);

  afterAll(async () => {
    if (variantPageId) await ContentTestHelper.cleanupById(variantPageId);
    await variantDocTypeFixture.cleanup();
  }, 60000);

  it("publishes every culture and keeps the untouched culture's values", async () => {
    expect(secondaryCulture).toBeTruthy();
    expect(variantPageId).toBeTruthy();

    // Seed both cultures in one call — create-variant writes the new culture's
    // values plus any entry that names a culture explicitly.
    const variantResult = await callTool(
      createVariantTool,
      {
        id: variantPageId!,
        culture: secondaryCulture,
        values: [
          { alias: "title", value: "Variant Title Secondary" },
          { alias: "title", value: "Variant Title Default Before", culture: defaultCulture },
        ],
      },
      extra,
    );
    expect(variantResult.isError).toBeFalsy();
    expect(await readValue(variantPageId!, "title", defaultCulture)).toBe("Variant Title Default Before");
    expect(await readValue(variantPageId!, "title", secondaryCulture)).toBe("Variant Title Secondary");

    // Address the default culture only — the other culture is never mentioned.
    const result = await callTool(
      saveAndPublishTool,
      {
        id: variantPageId!,
        values: [{ alias: "title", value: "Variant Title Default After", culture: defaultCulture }],
        includeDescendants: false,
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as { saved: boolean; published: boolean };
    expect(data.saved).toBe(true);
    expect(data.published).toBe(true);

    // The addressed culture updated; the untouched one survived the
    // full-replace PUT (this is the alias+culture keying in mergeValues).
    expect(await readValue(variantPageId!, "title", defaultCulture)).toBe("Variant Title Default After");
    expect(await readValue(variantPageId!, "title", secondaryCulture)).toBe("Variant Title Secondary");

    // `culturesToPublish` carries every variant culture, not just the addressed
    // one — so both variants must come out published.
    const statusResult = await callTool(getPublishStatusTool, { id: variantPageId! }, extra);
    const status = statusResult.structuredContent as {
      isPublished: boolean;
      variants: Array<{ culture: string | null; state: string }>;
    };
    expect(status.isPublished).toBe(true);
    const stateByCulture = new Map(status.variants.map((v) => [v.culture, v.state]));
    expect(stateByCulture.get(defaultCulture)).toBe("Published");
    expect(stateByCulture.get(secondaryCulture)).toBe("Published");
  }, 120000);
});
