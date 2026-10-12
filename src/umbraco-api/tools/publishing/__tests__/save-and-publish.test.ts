/**
 * save-and-publish Integration Tests
 *
 * Tests for the save-and-publish POST tool in the publishing collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 */

import { describe, it, expect, jest, beforeAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  getStructuredContent,
} from "./setup.js";
import {
  ContentBuilder,
  ContentTestHelper,
  initContentTestState,
  extractChainedResult,
} from "../../content/__tests__/setup.js";
import { initTranslationTestState } from "../../translation/__tests__/setup.js";
import saveAndPublishTool from "../post/save-and-publish.js";
import createVariantTool from "../../translation/post/create-variant.js";
import editPageTool from "../../content/put/edit-page.js";
import { expectPublished } from "../../../../testing/state-assertions.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { mcpClientManager } from "../../../mcp-client.js";

const TEST_PAGE_NAME_WITH_VALUES = "_Test Save Publish With Values";
const TEST_PAGE_NAME_NO_VALUES = "_Test Save Publish No Values";
const TEST_PAGE_NAME_FALLBACK = "_Test Save Publish Fallback";
const TEST_PAGE_NAME_FALLBACK_PUBLISH_FAILS = "_Test Save Publish Fallback Publish Fails";
const TEST_PAGE_NAME_NO_DATA_LOSS = "_Test Save Publish Fallback No Data Loss";
const TEST_PAGE_NAME_NO_DATA_LOSS_MULTI_CULTURE = "_Test Save Publish Fallback No Data Loss Multi Culture";

/** Mock listTools so the atomic update-and-publish-document tool reads as unavailable, forcing the fallback path. */
function mockAtomicToolUnavailable() {
  const listToolsSpy = jest.spyOn(mcpClientManager, "listTools");
  listToolsSpy.mockImplementationOnce(async () => ({
    tools: [
      { name: "get-document-by-id" },
      { name: "update-document" },
      { name: "publish-document" },
    ],
  }));
  return listToolsSpy;
}

/**
 * Create a minimal variesByCulture=true document type with its own "title"
 * and "subtitle" TextBox properties (the content collection's seeded
 * "Content" doc type carries the same two aliases via composition, but it's
 * invariant — a dedicated variant-capable type is needed to seed per-culture
 * values for the multi-culture data-loss test). Mirrors the pattern in
 * translation/__tests__/helpers/variant-doctype-fixture.ts, extended to
 * include properties (create-document-type's own properties array, same as
 * content/__tests__/helpers/block-fixture.ts's provisioning step).
 */
async function createVariantDocTypeWithTitleAndSubtitle(): Promise<string> {
  const findTextstring = await mcpClientManager.callTool("cms", "find-data-type", { name: "Textstring" });
  const textstringId = (extractChainedResult(findTextstring)?.items ?? [])
    .find((d: any) => d.name === "Textstring")?.id;
  if (!textstringId) throw new Error("Built-in \"Textstring\" data type not found");

  const alias = `_test_save_publish_variant_doctype_${Date.now()}`;
  const createResult = await mcpClientManager.callTool("cms", "create-document-type", {
    name: alias,
    alias,
    icon: "icon-document",
    allowedAsRoot: true,
    compositions: [],
    allowedDocumentTypes: [],
    properties: [
      { name: "Title", alias: "title", dataTypeId: textstringId, group: "Content" },
      { name: "Subtitle", alias: "subtitle", dataTypeId: textstringId, group: "Content" },
    ],
  });
  if (createResult.isError) {
    throw new Error(`create-document-type failed: ${JSON.stringify(extractChainedResult(createResult))}`);
  }
  const id: string = extractChainedResult(createResult)?.id;
  if (!id) throw new Error("create-document-type did not return an id");

  const getResult = await mcpClientManager.callTool("cms", "get-document-type-by-id", { id });
  const dt = extractChainedResult(getResult) as any;

  // Document-type-level variesByCulture is necessary but not sufficient —
  // each PropertyType also carries its own variesByCulture flag, which
  // defaults to false and must be flipped per property or Umbraco rejects
  // culture-tagged values for it ("Property type culture variance mismatch").
  const culturedProperties = (dt.properties ?? []).map((p: any) => ({ ...p, variesByCulture: true }));

  const updateResult = await mcpClientManager.callTool("cms", "update-document-type", {
    id,
    data: {
      alias: dt.alias,
      name: dt.name,
      description: dt.description ?? null,
      icon: dt.icon,
      allowedAsRoot: dt.allowedAsRoot,
      variesByCulture: true,
      variesBySegment: dt.variesBySegment,
      collection: dt.collection ?? null,
      isElement: dt.isElement,
      properties: culturedProperties,
      containers: dt.containers ?? [],
      allowedTemplates: dt.allowedTemplates ?? [],
      defaultTemplate: dt.defaultTemplate ?? null,
      cleanup: dt.cleanup ?? { preventCleanup: false, keepAllVersionsNewerThanDays: null, keepLatestVersionPerDayForDays: null },
      allowedDocumentTypes: dt.allowedDocumentTypes ?? [],
      compositions: dt.compositions ?? [],
    },
  });
  if (updateResult.isError) {
    await mcpClientManager.callTool("cms", "delete-document-type", { id }).catch(() => undefined);
    throw new Error(`update-document-type (variesByCulture) failed: ${JSON.stringify(extractChainedResult(updateResult))}`);
  }

  return id;
}

describe("save-and-publish", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testParentId: string;
  let testDocumentTypeId: string;
  let lastCreatedId: string | undefined;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testParentId = state.testPageId;
    testDocumentTypeId = state.testDocumentTypeId;
  }, 60000);

  afterEach(async () => {
    if (lastCreatedId) {
      await ContentTestHelper.cleanupById(lastCreatedId);
      lastCreatedId = undefined;
    }
  }, 30000);

  it("saves values and publishes in one call", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME_WITH_VALUES)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    lastCreatedId = doc.getId();

    const result = await saveAndPublishTool.handler(
      {
        id: doc.getId(),
        values: [{ alias: "title", value: "Save And Publish Title" }],
        includeDescendants: false,
      },
      extra,
    );

    expect(createSnapshotResult(result, doc.getId())).toMatchSnapshot();
    await expectPublished(doc.getId(), extra);
  }, 60000);

  it("publishes without values when none provided", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME_NO_VALUES)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    lastCreatedId = doc.getId();

    await editPageTool.handler(
      { id: doc.getId(), values: [{ alias: "title", value: "Pre-edited Title" }] },
      extra,
    );

    const result = await saveAndPublishTool.handler(
      { id: doc.getId(), values: undefined, includeDescendants: false },
      extra,
    );

    expect(createSnapshotResult(result, doc.getId())).toMatchSnapshot();
    await expectPublished(doc.getId(), extra);
  }, 60000);

  it("falls back to update-document + publish-document when update-and-publish-document isn't available", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME_FALLBACK)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    lastCreatedId = doc.getId();

    // Only listTools is mocked — get-document-by-id, update-document and
    // publish-document still run for real against the running Umbraco,
    // exercising the actual fallback sequence end to end. callTool is also
    // spied (pass-through to the real implementation) purely to record which
    // tool names were invoked, so the test can prove the fallback path — not
    // just the atomic one — actually ran.
    const listToolsSpy = mockAtomicToolUnavailable();

    const originalCallTool = mcpClientManager.callTool.bind(mcpClientManager);
    const calledToolNames: string[] = [];
    const callToolSpy = jest.spyOn(mcpClientManager, "callTool");
    callToolSpy.mockImplementation(async (server: string, toolName: string, args: Record<string, unknown>) => {
      calledToolNames.push(toolName);
      return originalCallTool(server, toolName, args);
    });

    try {
      const result = await callTool(
        saveAndPublishTool,
        {
          id: doc.getId(),
          values: [{ alias: "title", value: "Save And Publish Fallback Title" }],
          includeDescendants: false,
        },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.saved).toBe(true);
      expect(data.published).toBe(true);
      expect(data.updatedFields).toEqual(["title"]);

      // Prove the fallback sequence actually ran, not the atomic tool.
      expect(calledToolNames).not.toContain("update-and-publish-document");
      expect(calledToolNames).toContain("update-document");
      expect(calledToolNames).toContain("publish-document");

      await expectPublished(doc.getId(), extra);
    } finally {
      callToolSpy.mockRestore();
      listToolsSpy.mockRestore();
    }
  }, 60000);

  it("reports saved:true, published:false when publish-document fails after a successful fallback update", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME_FALLBACK_PUBLISH_FAILS)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .create();
    lastCreatedId = doc.getId();

    const listToolsSpy = mockAtomicToolUnavailable();

    // get-document-by-id and update-document run for real; only
    // publish-document is intercepted to simulate a failure after a
    // successful save, so capture the real implementation before spying.
    const originalCallTool = mcpClientManager.callTool.bind(mcpClientManager);
    const callToolSpy = jest.spyOn(mcpClientManager, "callTool");
    callToolSpy.mockImplementation(async (server: string, toolName: string, args: Record<string, unknown>) => {
      if (toolName === "publish-document") {
        const problemDetails = {
          type: "Error",
          title: "Publish failed",
          status: 500,
          detail: "Simulated publish failure",
        };
        return {
          isError: true,
          structuredContent: problemDetails,
          content: [{ type: "text" as const, text: JSON.stringify(problemDetails) }],
        };
      }
      return originalCallTool(server, toolName, args);
    });

    try {
      const result = await callTool(
        saveAndPublishTool,
        {
          id: doc.getId(),
          values: [{ alias: "title", value: "Save And Publish Fallback Publish Fails Title" }],
          includeDescendants: false,
        },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.saved).toBe(true);
      expect(data.published).toBe(false);
      expect(data.message).toContain("but publish failed");
    } finally {
      callToolSpy.mockRestore();
      listToolsSpy.mockRestore();
    }
  }, 60000);

  it("does not lose an untouched property when updating only one via the fallback path", async () => {
    const doc = await new ContentBuilder()
      .withName(TEST_PAGE_NAME_NO_DATA_LOSS)
      .withDocumentType(testDocumentTypeId)
      .withParent(testParentId)
      .withValue("title", "Original Title")
      .withValue("subtitle", "Original Subtitle")
      .create();
    lastCreatedId = doc.getId();

    const listToolsSpy = mockAtomicToolUnavailable();

    try {
      const result = await callTool(
        saveAndPublishTool,
        {
          id: doc.getId(),
          values: [{ alias: "subtitle", value: "Updated Subtitle" }],
          includeDescendants: false,
        },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.saved).toBe(true);
      expect(data.published).toBe(true);

      const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: doc.getId() });
      const updatedValues: any[] = extractChainedResult(docResult)?.values ?? [];
      expect(updatedValues.find((v) => v.alias === "subtitle")?.value).toBe("Updated Subtitle");
      // The untouched "title" field must survive mergeValues in the fallback path unchanged.
      expect(updatedValues.find((v) => v.alias === "title")?.value).toBe("Original Title");
    } finally {
      listToolsSpy.mockRestore();
    }
  }, 60000);

  it("does not lose an untouched culture's values when updating one culture via the fallback path", async () => {
    const state = await initTranslationTestState(extra);
    if (!state.multiLanguage) {
      console.warn("Skipping multi-culture no-data-loss test: only one language configured");
      return;
    }
    const { defaultCulture, secondaryCulture } = state;

    const docTypeId = await createVariantDocTypeWithTitleAndSubtitle();
    let docId: string | undefined;
    try {
      const createResult = await mcpClientManager.callTool("cms", "create-document", {
        documentTypeId: docTypeId,
        name: TEST_PAGE_NAME_NO_DATA_LOSS_MULTI_CULTURE,
        cultures: [defaultCulture],
        values: [
          { alias: "title", value: "Original EN Title", culture: defaultCulture, segment: null },
          { alias: "subtitle", value: "Original EN Subtitle", culture: defaultCulture, segment: null },
        ],
      });
      if (createResult.isError) {
        throw new Error(`create-document failed: ${JSON.stringify(extractChainedResult(createResult))}`);
      }
      docId = extractChainedResult(createResult)?.id;
      if (!docId) throw new Error("create-document did not return an id");

      const variantResult = await createVariantTool.handler(
        {
          id: docId,
          culture: secondaryCulture,
          values: [
            { alias: "title", value: "Original DA Title", culture: secondaryCulture },
            { alias: "subtitle", value: "Original DA Subtitle", culture: secondaryCulture },
          ],
        },
        extra,
      );
      expect(variantResult.isError).toBeFalsy();

      const listToolsSpy = mockAtomicToolUnavailable();
      try {
        const result = await callTool(
          saveAndPublishTool,
          {
            id: docId,
            values: [{ alias: "subtitle", value: "Updated EN Subtitle", culture: defaultCulture }],
            includeDescendants: false,
          },
          extra,
        );

        expect(result.isError).toBeFalsy();
        const data = getStructuredContent(result) as any;
        expect(data.saved).toBe(true);
        expect(data.published).toBe(true);
      } finally {
        listToolsSpy.mockRestore();
      }

      const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: docId });
      const updatedValues: any[] = extractChainedResult(docResult)?.values ?? [];
      const valueFor = (alias: string, culture: string) =>
        updatedValues.find((v) => v.alias === alias && v.culture === culture)?.value;

      expect(valueFor("subtitle", defaultCulture)).toBe("Updated EN Subtitle");
      // Untouched field on the updated culture, and the entire other culture,
      // must survive mergeValues in the fallback path unchanged.
      expect(valueFor("title", defaultCulture)).toBe("Original EN Title");
      expect(valueFor("title", secondaryCulture)).toBe("Original DA Title");
      expect(valueFor("subtitle", secondaryCulture)).toBe("Original DA Subtitle");
    } finally {
      if (docId) await ContentTestHelper.cleanupById(docId);
      await mcpClientManager.callTool("cms", "delete-document-type", { id: docTypeId }).catch(() => undefined);
    }
  }, 60000);
});
