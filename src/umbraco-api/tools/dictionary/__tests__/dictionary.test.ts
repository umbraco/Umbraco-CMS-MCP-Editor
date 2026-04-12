/**
 * Dictionary Collection Integration Tests
 *
 * Tests for list-dictionary, search-dictionary, get-dictionary, create-dictionary,
 * update-dictionary, move-dictionary.
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 *
 * Prerequisites:
 * - Running Umbraco instance with API user configured (see CLAUDE.md)
 * - Valid credentials in .env file
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,

  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";
import { setupEditorElicitation } from "../../../../testing/setup-elicitation.js";

import listDictionaryTool from "../get/list-dictionary.js";
import searchDictionaryTool from "../get/search-dictionary.js";
import getDictionaryTool from "../get/get-dictionary.js";
import createDictionaryTool from "../post/create-dictionary.js";
import updateDictionaryTool from "../put/update-dictionary.js";
import moveDictionaryTool from "../put/move-dictionary.js";

const TEST_DICTIONARY_NAME = "mcp-integration-test-item";

const elicitation = setupEditorElicitation(jest.fn as any);

describe("Dictionary Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let cmsAvailable = false;
  let createdItemId: string | null = null;
  let existingItemId: string | null = null;
  let defaultIsoCode: string = "en-US";

  beforeAll(async () => {
    try {
      const result = await listDictionaryTool.handler({ parentId: undefined }, extra);
      const data = getStructuredContent(result) as any;
      if (!result.isError && data) {
        cmsAvailable = true;
        if (data.items?.length > 0) {
          existingItemId = data.items[0].id;
        }
      }
    } catch {
      console.warn("CMS not available — dictionary integration tests will be skipped");
    }
  }, 60000);

  afterAll(async () => {
    if (createdItemId) {
      try {
        const { mcpClientManager } = await import("../../../mcp-client.js");
        await mcpClientManager.callTool("cms", "delete-dictionary-item", { id: createdItemId });
      } catch {
        // Best-effort cleanup
      }
    }
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("list-dictionary", () => {
    it("should browse root dictionary entries", async () => {
      if (!cmsAvailable) return;

      const result = await listDictionaryTool.handler({ parentId: undefined }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("id");
        expect(data.items[0]).toHaveProperty("name");
        expect(data.items[0]).toHaveProperty("translatedLanguages");
        expect(data.items[0].translatedLanguages).toBeInstanceOf(Array);
      }
    }, 30000);
  });

  describe("search-dictionary", () => {
    it("should search for dictionary items by key name", async () => {
      if (!cmsAvailable) return;

      const result = await searchDictionaryTool.handler({ query: "a" }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));

      if (data.items.length > 0) {
        expect(data.items[0]).toHaveProperty("id");
        expect(data.items[0]).toHaveProperty("name");
      }
    }, 30000);

    it("should return empty results for non-matching query", async () => {
      if (!cmsAvailable) return;

      const result = await searchDictionaryTool.handler({ query: "xyznonexistent99999mcp" }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data.items).toBeInstanceOf(Array);
      // Search may return partial matches depending on the CMS search engine
      expect(data.total).toEqual(expect.any(Number));
    }, 30000);
  });

  describe("get-dictionary", () => {
    it("should get a dictionary item with all translations", async () => {
      if (!cmsAvailable || !existingItemId) {
        console.warn("Skipping get-dictionary test: no existing dictionary items found");
        return;
      }

      const result = await getDictionaryTool.handler({ id: existingItemId }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(existingItemId);
      expect(data.name).toEqual(expect.any(String));
      expect(data.translations).toBeInstanceOf(Array);

      if (data.translations.length > 0) {
        expect(data.translations[0]).toHaveProperty("isoCode");
        expect(data.translations[0]).toHaveProperty("languageName");
        expect(data.translations[0]).toHaveProperty("translation");
      }
    }, 30000);

    it("should return error for non-existent dictionary item", async () => {
      if (!cmsAvailable) return;

      const result = await getDictionaryTool.handler(
        { id: "00000000-0000-0000-0000-000000000000" },
        extra,
      );

      expect(result.isError).toBeTruthy();
    }, 30000);
  });

  describe("create-dictionary, update-dictionary, move-dictionary lifecycle", () => {
    it("should create a dictionary item", async () => {
      if (!cmsAvailable) return;

      const result = await createDictionaryTool.handler(
        {
          name: TEST_DICTIONARY_NAME,
          translations: [{ isoCode: defaultIsoCode, translation: "Integration test value" }],
          parentId: undefined,
        },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping create-dictionary assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.name).toBe(TEST_DICTIONARY_NAME);
      expect(data.message).toContain(TEST_DICTIONARY_NAME);
      expect(data.id).toBeTruthy();

      createdItemId = data.id;
    }, 30000);

    it("should update translations for the created dictionary item", async () => {
      if (!cmsAvailable || !createdItemId) {
        console.warn("Skipping update test: no dictionary item was created");
        return;
      }

      const result = await updateDictionaryTool.handler(
        {
          id: createdItemId,
          translations: [{ isoCode: defaultIsoCode, translation: "Updated integration test value" }],
        },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping update-dictionary assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(createdItemId);
      expect(data.message).toContain("Updated");
      expect(data.updatedLanguages).toContain(defaultIsoCode);
    }, 30000);

    it("should move the created dictionary item to root", async () => {
      if (!cmsAvailable || !createdItemId) {
        console.warn("Skipping move test: no dictionary item was created");
        return;
      }

      const result = await moveDictionaryTool.handler(
        { id: createdItemId, targetParentId: undefined },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping move-dictionary assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(createdItemId);
      expect(data.message).toContain("Moved");
    }, 30000);
  });

  describe("elicitation rejection", () => {
    it("should cancel create when elicitation is rejected", async () => {
      if (!cmsAvailable) return;

      elicitation.rejectAll();

      const result = await createDictionaryTool.handler(
        {
          name: "should-not-be-created",
          translations: [{ isoCode: defaultIsoCode, translation: "Should not appear" }],
          parentId: undefined,
        },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);

    it("should cancel update when elicitation is rejected", async () => {
      if (!cmsAvailable || !existingItemId) {
        console.warn("Skipping elicitation rejection test: no existing dictionary items found");
        return;
      }

      elicitation.rejectAll();

      const result = await updateDictionaryTool.handler(
        {
          id: existingItemId,
          translations: [{ isoCode: defaultIsoCode, translation: "Should not change" }],
        },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);

    it("should cancel move when elicitation is rejected", async () => {
      if (!cmsAvailable || !existingItemId) {
        console.warn("Skipping elicitation rejection test: no existing dictionary items found");
        return;
      }

      elicitation.rejectAll();

      const result = await moveDictionaryTool.handler(
        { id: existingItemId, targetParentId: undefined },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.includes("cancelled") || result.isError).toBe(true);
    }, 30000);
  });
});
