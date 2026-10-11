import { describe, it, expect, beforeAll, afterEach } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  getStructuredContent,
  initContentTestState,
  ContentTestHelper,
} from "./setup.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { getOrCreateCompositionDoctypeFixture } from "./helpers/composition-doctype-fixture.js";
import createPageTool from "../post/create-page.js";
import getPageTool from "../get/get-page.js";

const TEST_PAGE_NAME = "_Test Create Page";
const TEST_COMPOSITION_PAGE_NAME = "_Test Create Page Composition Value";

describe("create-page", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let testPageId: string;
  let testDocumentTypeId: string;
  let lastCreatedId: string | undefined;

  beforeAll(async () => {
    const state = await initContentTestState(extra);
    testPageId = state.testPageId;
    testDocumentTypeId = state.testDocumentTypeId;
  }, 60000);

  afterEach(async () => {
    if (lastCreatedId) {
      await ContentTestHelper.cleanupById(lastCreatedId);
      lastCreatedId = undefined;
    }
  }, 30000);

  it("should create a draft page", async () => {
    const result = await createPageTool.handler(
      {
        name: TEST_PAGE_NAME,
        documentTypeId: testDocumentTypeId,
        parentId: testPageId,
        values: undefined,
      },
      extra,
    );

    expect(result.isError).toBeFalsy();

    const data = getStructuredContent(result) as any;
    lastCreatedId = data.id;
    const verifyResult = await getPageTool.handler({ id: data.id }, extra);

    expect(createSnapshotResult(verifyResult, data.id)).toMatchSnapshot();
  }, 30000);

  it("resolves editorAlias for a value on a composition-inherited property", async () => {
    const fixture = await getOrCreateCompositionDoctypeFixture();

    const result = await callTool(
      createPageTool,
      {
        name: TEST_COMPOSITION_PAGE_NAME,
        documentTypeId: fixture.hostDocumentTypeId,
        parentId: undefined,
        values: [
          { alias: fixture.hostPropertyAlias, value: "Host value" },
          { alias: fixture.compositionPropertyAlias, value: "Composition-inherited value" },
        ],
      },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    lastCreatedId = data.id;

    const verifyResult = await getPageTool.handler({ id: data.id }, extra);
    const verifyData = getStructuredContent(verifyResult) as any;
    const compositionValue = verifyData.values?.find((v: any) => v.alias === fixture.compositionPropertyAlias);
    expect(compositionValue?.value).toBe("Composition-inherited value");
  }, 30000);

  it("fails before calling Umbraco when a value's alias isn't a property on the document type", async () => {
    const fixture = await getOrCreateCompositionDoctypeFixture();

    const result = await callTool(
      createPageTool,
      {
        name: TEST_COMPOSITION_PAGE_NAME,
        documentTypeId: fixture.hostDocumentTypeId,
        parentId: undefined,
        values: [{ alias: "notARealPropertyAlias", value: "whatever" }],
      },
      extra,
    );

    expect(result.isError).toBeTruthy();
    const text = JSON.stringify(result);
    expect(text).toContain("notARealPropertyAlias");

    // No partial page should have been created.
    const found = await ContentTestHelper.findDocument(TEST_COMPOSITION_PAGE_NAME);
    expect(found).toBeUndefined();
  }, 30000);
});
