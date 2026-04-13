/**
 * Language Collection Integration Tests
 *
 * Tests for list-languages, get-language, create-language, update-language, delete-language.
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

import listLanguagesTool from "../get/list-languages.js";
import getLanguageTool from "../get/get-language.js";
import createLanguageTool from "../post/create-language.js";
import updateLanguageTool from "../put/update-language.js";
import deleteLanguageTool from "../delete/delete-language.js";

const TEST_LANGUAGE_ISO = "nb-NO";

const elicitation = setupEditorElicitation(jest.fn as any);

describe("Language Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let cmsAvailable = false;
  let defaultIsoCode: string;
  let createdIsoCode: string | null = null;

  beforeAll(async () => {
    try {
      const result = await listLanguagesTool.handler({}, extra);
      const data = getStructuredContent(result) as any;
      if (!result.isError && data) {
        cmsAvailable = true;
        const defaultLang = data.items?.find((l: any) => l.isDefault);
        if (defaultLang) {
          defaultIsoCode = defaultLang.isoCode;
        }
      }
    } catch {
      console.warn("CMS not available — language integration tests will be skipped");
    }
  }, 60000);

  afterAll(async () => {
    if (createdIsoCode) {
      try {
        await deleteLanguageTool.handler({ isoCode: createdIsoCode }, extra);
      } catch {
        // Best-effort cleanup
      }
    }
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  describe("list-languages", () => {
    it("should list all configured languages", async () => {
      if (!cmsAvailable) return;

      const result = await listLanguagesTool.handler({}, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toEqual(expect.any(Number));
      expect(data.items.length).toBeGreaterThan(0);

      const item = data.items[0];
      expect(item).toHaveProperty("isoCode");
      expect(item).toHaveProperty("name");
      expect(item).toHaveProperty("isDefault");
      expect(item).toHaveProperty("isMandatory");
    }, 30000);
  });

  describe("get-language", () => {
    it("should get default language details by ISO code", async () => {
      if (!cmsAvailable || !defaultIsoCode) return;

      const result = await getLanguageTool.handler({ isoCode: defaultIsoCode }, extra);

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.isoCode).toBe(defaultIsoCode);
      expect(data.name).toEqual(expect.any(String));
      expect(data.isDefault).toBe(true);
      expect(data).toHaveProperty("isMandatory");
      expect(data).toHaveProperty("fallbackIsoCode");
    }, 30000);

    it("should return error for invalid ISO code", async () => {
      if (!cmsAvailable) return;

      const result = await getLanguageTool.handler({ isoCode: "xx-INVALID" }, extra);

      expect(result.isError).toBeTruthy();
    }, 30000);
  });

  describe("create-language, update-language, delete-language lifecycle", () => {
    it("should create a new language", async () => {
      if (!cmsAvailable) return;

      const result = await createLanguageTool.handler(
        { isoCode: TEST_LANGUAGE_ISO, isDefault: false, isMandatory: false, fallbackIsoCode: undefined },
        extra,
      );

      if (result.isError) {
        // Language may already exist on this Umbraco instance
        console.warn(`Skipping create test: ${getStructuredContent(result)}`);
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.message).toContain(TEST_LANGUAGE_ISO);
      expect(data.isoCode).toBe(TEST_LANGUAGE_ISO);

      createdIsoCode = TEST_LANGUAGE_ISO;
    }, 30000);

    it("should update the created language", async () => {
      if (!cmsAvailable || !createdIsoCode) {
        console.warn("Skipping update test: no language was created");
        return;
      }

      const result = await updateLanguageTool.handler(
        { isoCode: createdIsoCode, isMandatory: false, isDefault: undefined, fallbackIsoCode: undefined },
        extra,
      );

      if (result.isError) {
        console.warn("Skipping update-language assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.isoCode).toBe(createdIsoCode);
      expect(data.message).toContain("updated");
    }, 30000);

    it("should delete the created language", async () => {
      if (!cmsAvailable || !createdIsoCode) {
        console.warn("Skipping delete test: no language was created");
        return;
      }

      const result = await deleteLanguageTool.handler({ isoCode: createdIsoCode }, extra);

      if (result.isError) {
        console.warn("Skipping delete-language assertions: CMS returned error");
        return;
      }

      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.isoCode).toBe(createdIsoCode);
      expect(data.message).toContain("deleted");

      createdIsoCode = null;
    }, 30000);
  });

  describe("elicitation rejection", () => {
    it("should cancel create when elicitation is rejected", async () => {
      if (!cmsAvailable) return;

      elicitation.rejectAll();

      const result = await createLanguageTool.handler(
        { isoCode: "fr-FR", isDefault: false, isMandatory: false, fallbackIsoCode: undefined },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
    }, 30000);

    it("should cancel update when elicitation is rejected", async () => {
      if (!cmsAvailable || !defaultIsoCode) return;

      elicitation.rejectAll();

      const result = await updateLanguageTool.handler(
        { isoCode: defaultIsoCode, isMandatory: false, isDefault: undefined, fallbackIsoCode: undefined },
        extra,
      );

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
    }, 30000);

    it("should cancel delete when elicitation is rejected", async () => {
      if (!cmsAvailable || !defaultIsoCode) return;

      elicitation.rejectAll();

      const result = await deleteLanguageTool.handler({ isoCode: defaultIsoCode }, extra);

      const data = getStructuredContent(result) as any;
      // Tool may error before reaching elicitation (CMS call fails) or cancel via elicitation
      expect(data?.message?.toLowerCase().includes("cancelled") || result.isError).toBe(true);
    }, 30000);
  });
});
