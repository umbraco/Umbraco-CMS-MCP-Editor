import { describe, it, expect, beforeAll, afterEach, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  getStructuredContent,
  initContentTestState,
  ContentTestHelper,
} from "./setup.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import createPageTool from "../post/create-page.js";
import getPageTool from "../get/get-page.js";
import { CompositionDoctypeFixture } from "./helpers/composition-doctype-fixture.js";

const TEST_PAGE_NAME = "_Test Create Page";

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

  describe("composition-inherited properties (#201)", () => {
    const fixture = new CompositionDoctypeFixture();
    let hostDocTypeId: string;
    let propertyAlias: string;

    beforeAll(async () => {
      const result = await fixture.create();
      hostDocTypeId = result.hostDocTypeId;
      propertyAlias = result.propertyAlias;
    }, 30000);

    afterAll(async () => {
      await fixture.cleanup();
    }, 30000);

    it("resolves editorAlias for a value on a composition-inherited property and creates the page", async () => {
      const result = await callTool(
        createPageTool,
        {
          name: "_Test Create Page Composition",
          documentTypeId: hostDocTypeId,
          parentId: undefined,
          values: [{ alias: propertyAlias, value: "Composed SEO Title" }],
        },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      lastCreatedId = data.id;
      expect(typeof data.id).toBe("string");
    }, 30000);

    it("fails before calling Umbraco for an alias that is not a property on the document type at all", async () => {
      const result = await callTool(
        createPageTool,
        {
          name: "_Test Create Page Bogus Alias",
          documentTypeId: hostDocTypeId,
          parentId: undefined,
          values: [{ alias: "thisAliasDoesNotExistAnywhere", value: "irrelevant" }],
        },
        extra,
      );

      expect(result.isError).toBeTruthy();
      expect(JSON.stringify(result)).toContain("thisAliasDoesNotExistAnywhere");

      // No page should have been created — searching for it should find nothing.
      const found = await ContentTestHelper.findDocument("_Test Create Page Bogus Alias");
      expect(found).toBeUndefined();
    }, 30000);
  });
});
