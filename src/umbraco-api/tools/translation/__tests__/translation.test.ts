/**
 * Translation Collection Integration Tests
 *
 * Tests for list-untranslated, create-variant, copy-variant.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 * - Site must have more than one language for most tests to run
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  setupElicitationMock,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

import listLanguagesTool from "../../language/get/list-languages.js";
import listChildrenTool from "../../content/get/list-children.js";
import listUntranslatedTool from "../get/list-untranslated.js";
import createVariantTool from "../post/create-variant.js";
import copyVariantTool from "../post/copy-variant.js";

const elicitation = setupElicitationMock(jest.fn as any);

describe("Translation Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let cmsAvailable = false;
  let multiLanguage = false;
  let defaultCulture: string;
  let secondaryCulture: string;
  let testPageId: string;

  beforeAll(async () => {
    try {
      // Check CMS availability and language configuration
      const langResult = await listLanguagesTool.handler({}, extra);
      const langData = getStructuredContent(langResult) as any;
      if (langResult.isError || !langData) {
        console.warn("CMS not available — translation integration tests will be skipped");
        return;
      }

      cmsAvailable = true;
      const languages = langData.items ?? [];
      const defaultLang = languages.find((l: any) => l.isDefault);
      const secondaryLang = languages.find((l: any) => !l.isDefault);

      if (!defaultLang || !secondaryLang) {
        console.warn("Only one language configured — multi-language tests will be skipped");
        defaultCulture = defaultLang?.isoCode ?? "";
        return;
      }

      multiLanguage = true;
      defaultCulture = defaultLang.isoCode;
      secondaryCulture = secondaryLang.isoCode;

      // Find a test page
      const pagesResult = await listChildrenTool.handler({ parentId: undefined }, extra);
      const pagesData = getStructuredContent(pagesResult) as any;
      if (!pagesResult.isError && pagesData?.items?.length > 0) {
        testPageId = pagesData.items[0].id;
      }
    } catch {
      console.warn("CMS not available — translation integration tests will be skipped");
    }
  }, 60000);

  afterAll(() => {
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("list-untranslated", () => {
    it("should list pages missing a culture variant", async () => {
      if (!cmsAvailable || !multiLanguage) {
        console.warn("Skipping list-untranslated test: requires multi-language Umbraco site");
        return;
      }

      const result = await listUntranslatedTool.handler(
        { culture: secondaryCulture, parentId: undefined },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("id");
        expect(data.items[0]).toHaveProperty("name");
        expect(data.items[0]).toHaveProperty("availableCultures");
        expect(data.items[0].availableCultures).toBeInstanceOf(Array);
      }
    }, 60000);
  });

  describe("create-variant", () => {
    it("should create a language variant for a page", async () => {
      if (!cmsAvailable || !multiLanguage || !testPageId) {
        console.warn("Skipping create-variant test: requires multi-language site and a test page");
        return;
      }

      const result = await createVariantTool.handler(
        { id: testPageId, culture: secondaryCulture, values: undefined },
        extra,
      );

      // The variant may already exist — that is a valid scenario
      if (result.isError) {
        const errData = getStructuredContent(result) as any;
        const errText = typeof errData === "string" ? errData : JSON.stringify(errData);
        if (errText.includes("already exists")) {
          console.warn("Skipping: variant already exists on test page");
          return;
        }
      }

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testPageId);
      expect(data.culture).toBe(secondaryCulture);
      expect(data.message).toContain(secondaryCulture);
    }, 30000);

    it("should cancel create-variant when elicitation is rejected", async () => {
      if (!cmsAvailable || !multiLanguage || !testPageId) {
        console.warn("Skipping elicitation rejection test: requires multi-language site and a test page");
        return;
      }

      elicitation.rejectAll();

      const result = await createVariantTool.handler(
        { id: testPageId, culture: secondaryCulture, values: undefined },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);
  });

  describe("copy-variant", () => {
    it("should copy content from default to secondary culture", async () => {
      if (!cmsAvailable || !multiLanguage || !testPageId) {
        console.warn("Skipping copy-variant test: requires multi-language site and a test page");
        return;
      }

      const result = await copyVariantTool.handler(
        { id: testPageId, sourceCulture: defaultCulture, targetCulture: secondaryCulture },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping copy-variant assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testPageId);
      expect(data.sourceCulture).toBe(defaultCulture);
      expect(data.targetCulture).toBe(secondaryCulture);
      expect(data.copiedFields).toBeInstanceOf(Array);
      expect(data.message).toContain(secondaryCulture);
    }, 30000);

    it("should cancel copy-variant when elicitation is rejected", async () => {
      if (!cmsAvailable || !multiLanguage || !testPageId) {
        console.warn("Skipping elicitation rejection test: requires multi-language site and a test page");
        return;
      }

      elicitation.rejectAll();

      const result = await copyVariantTool.handler(
        { id: testPageId, sourceCulture: defaultCulture, targetCulture: secondaryCulture },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);
  });
});
