/**
 * create-and-publish-page Integration Tests
 *
 * Tests for the create-and-publish-page POST tool in the content collection.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from "@jest/globals";
import {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  createSnapshotResult,
  getStructuredContent,
  initContentTestState,
  ContentTestHelper,
  NON_EXISTENT_UUID,
} from "./setup.js";
import { callTool } from "../../../../testing/call-tool-with-validation.js";
import { expectPublished } from "../../../../testing/state-assertions.js";
import createAndPublishPageTool from "../post/create-and-publish-page.js";
import getPageTool from "../get/get-page.js";
import { CompositionDoctypeFixture } from "./helpers/composition-doctype-fixture.js";
import { VariantPageFixture } from "./helpers/variant-page-fixture.js";

const TEST_PAGE_NAME = "_Test Create And Publish Page";
const TEST_VALUES = [{ alias: "title", value: "Created And Published Title" }];

describe("create-and-publish-page", () => {
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

  it("should create and publish a page in one call", async () => {
    const result = await callTool(
      createAndPublishPageTool,
      {
        name: TEST_PAGE_NAME,
        documentTypeId: testDocumentTypeId,
        parentId: testPageId,
        values: TEST_VALUES,
      },
      extra,
    );

    expect(result.isError).toBeFalsy();

    const data = getStructuredContent(result) as any;
    lastCreatedId = data.id;

    expect(createSnapshotResult(result, data.id)).toMatchSnapshot();

    await expectPublished(data.id, extra);
  }, 30000);

  it("should return an error for an invalid document type", async () => {
    const result = await callTool(
      createAndPublishPageTool,
      {
        name: TEST_PAGE_NAME,
        documentTypeId: NON_EXISTENT_UUID,
        parentId: testPageId,
        values: undefined,
      },
      extra,
    );

    expect(result.isError).toBeTruthy();
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

    it("resolves editorAlias for a value on a composition-inherited property, creates and publishes the page", async () => {
      const result = await callTool(
        createAndPublishPageTool,
        {
          name: "_Test Create And Publish Page Composition",
          documentTypeId: hostDocTypeId,
          values: [{ alias: propertyAlias, value: "Composed SEO Title" }],
        },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      lastCreatedId = data.id;
      expect(typeof data.id).toBe("string");

      await expectPublished(data.id, extra);

      // Confirm the composition-inherited value was actually stored, not just accepted.
      const verifyResult = await callTool(getPageTool, { id: data.id }, extra);
      const verifyData = getStructuredContent(verifyResult) as any;
      const storedValue = verifyData.values.find((v: any) => v.alias === propertyAlias);
      expect(storedValue?.value).toBe("Composed SEO Title");
    }, 30000);

    it("fails before calling Umbraco for an alias that is not a property on the document type at all", async () => {
      const result = await callTool(
        createAndPublishPageTool,
        {
          name: "_Test Create And Publish Page Bogus Alias",
          documentTypeId: hostDocTypeId,
          values: [{ alias: "thisAliasDoesNotExistAnywhere", value: "irrelevant" }],
        },
        extra,
      );

      expect(result.isError).toBeTruthy();
      expect(JSON.stringify(result)).toContain("thisAliasDoesNotExistAnywhere");
      // Assert on our own pre-flight message, not just "isError" + the alias —
      // a real Umbraco 400 for the same request would also satisfy those.
      expect(JSON.stringify(result)).toContain("not a property on this document type, own or inherited via composition");

      // No page should have been created — searching for it should find nothing.
      const found = await ContentTestHelper.findDocument("_Test Create And Publish Page Bogus Alias");
      expect(found).toBeUndefined();
    }, 30000);
  });

  describe("culture-variant document types", () => {
    const fixture = new VariantPageFixture();
    let documentTypeId: string;
    let propertyAlias: string;
    let defaultCulture: string;
    let secondaryCulture: string;

    beforeAll(async () => {
      ({ documentTypeId, propertyAlias, defaultCulture, secondaryCulture } = await fixture.create(extra));
    }, 120000);

    afterAll(async () => {
      await fixture.cleanup();
    }, 30000);

    it("creates the page in the default language when no culture is given", async () => {
      const result = await callTool(
        createAndPublishPageTool,
        {
          name: "_Test Create And Publish Page Variant Default",
          documentTypeId,
          parentId: undefined,
          values: [{ alias: propertyAlias, value: "Default culture title" }],
        },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      lastCreatedId = data.id;

      const doc = await VariantPageFixture.getDocument(data.id);
      expect(doc.variants.map((v: any) => v.culture)).toEqual([defaultCulture]);
      const variant = doc.variants.find((v: any) => v.culture === defaultCulture);
      expect(variant?.name).toBe("_Test Create And Publish Page Variant Default");
      expect(variant?.state).toBe("Published");
      // A value without a culture on a culture-variant property lands in the page's culture.
      const value = doc.values.find((v: any) => v.alias === propertyAlias);
      expect(value?.culture).toBe(defaultCulture);
      expect(value?.value).toBe("Default culture title");
    }, 30000);

    it("creates the page in the requested culture", async () => {
      const result = await callTool(
        createAndPublishPageTool,
        {
          name: "_Test Create And Publish Page Variant Secondary",
          documentTypeId,
          parentId: undefined,
          culture: secondaryCulture,
          values: undefined,
        },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      lastCreatedId = data.id;

      const doc = await VariantPageFixture.getDocument(data.id);
      expect(doc.variants.map((v: any) => v.culture)).toEqual([secondaryCulture]);
    }, 30000);

    it("ignores culture for a document type that does not vary by culture", async () => {
      const result = await callTool(
        createAndPublishPageTool,
        {
          name: "_Test Create And Publish Page Invariant With Culture",
          documentTypeId: testDocumentTypeId,
          parentId: testPageId,
          culture: secondaryCulture,
          values: TEST_VALUES,
        },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      lastCreatedId = data.id;

      const doc = await VariantPageFixture.getDocument(data.id);
      expect(doc.variants.map((v: any) => v.culture)).toEqual([null]);
    }, 30000);
  });
});
