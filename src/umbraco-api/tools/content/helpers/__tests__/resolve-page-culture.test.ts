/**
 * Unit tests for resolvePageCulture. Stubs mcpClientManager.callTool following
 * the same pattern as resolve-editor-aliases.test.ts — the mandatory-language
 * paths need a mandatory language on the site, and creating one against the
 * shared Umbraco instance would make every other suite's publish of a
 * culture-variant page fail while it exists. The culture resolution paths that
 * are safe to run live are covered by create-page.test.ts /
 * create-and-publish-page.test.ts.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { resolvePageCulture } from "../resolve-page-culture.js";
import { mcpClientManager } from "../../../../mcp-client.js";
import { getResultText } from "@umbraco-cms/mcp-server-sdk/testing";

interface Language {
  isoCode: string;
  isDefault?: boolean;
  isMandatory?: boolean;
}

describe("resolvePageCulture", () => {
  let spy: ReturnType<typeof jest.spyOn>;
  let variesByCulture: boolean;
  let languages: Language[];
  /** Total reported by get-language; defaults to `languages.length`. */
  let languageTotal: number | undefined;

  beforeEach(() => {
    variesByCulture = true;
    languages = [{ isoCode: "en-US", isDefault: true }, { isoCode: "da-DK" }];
    languageTotal = undefined;
    spy = jest.spyOn(mcpClientManager, "callTool").mockImplementation(async (_server: unknown, toolName: unknown) => {
      if (toolName === "get-document-type-by-id") {
        return { isError: false, structuredContent: { id: "doctype", variesByCulture, properties: [] }, content: [] };
      }
      if (toolName === "get-language") {
        const items = languages.map((l) => ({
          name: l.isoCode,
          isoCode: l.isoCode,
          isDefault: l.isDefault ?? false,
          isMandatory: l.isMandatory ?? false,
          fallbackIsoCode: null,
        }));
        return { isError: false, structuredContent: { total: languageTotal ?? items.length, items }, content: [] };
      }
      throw new Error(`unexpected tool call: ${String(toolName)}`);
    });
  });

  afterEach(() => {
    spy.mockRestore();
  });

  async function expectError(culture: string | undefined, options?: { forPublish?: boolean }): Promise<string> {
    const result = await resolvePageCulture("doctype", culture, options);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error result");
    return getResultText(result.errorResult as any);
  }

  it("resolves to null, without looking up languages, for an invariant document type", async () => {
    variesByCulture = false;

    const result = await resolvePageCulture("doctype", "da-DK", { forPublish: true });

    expect(result).toMatchObject({ ok: true, culture: null });
    expect(spy).not.toHaveBeenCalledWith(expect.anything(), "get-language", expect.anything());
  });

  it("defaults to the site's default language and hands back the document type and site cultures", async () => {
    const result = await resolvePageCulture("doctype", undefined);

    expect(result).toMatchObject({
      ok: true,
      culture: "en-US",
      documentType: { id: "doctype" },
      siteCultures: ["en-US", "da-DK"],
    });
  });

  it("matches a requested culture case-insensitively and returns the site's casing", async () => {
    const result = await resolvePageCulture("doctype", "DA-dk");

    expect(result).toMatchObject({ ok: true, culture: "da-DK" });
  });

  it("rejects a culture that is not a language on the site, listing the available ones", async () => {
    const message = await expectError("xx-XX");

    expect(message).toContain('Culture "xx-XX" is not a language on this site');
    expect(message).toContain("en-US, da-DK");
  });

  it("passes an unmatched culture through, without site cultures, when the language list is truncated", async () => {
    languageTotal = 250;

    const result = await resolvePageCulture("doctype", "xx-XX");

    expect(result).toMatchObject({ ok: true, culture: "xx-XX" });
    if (!result.ok) throw new Error("expected ok result");
    expect(result.siteCultures).toBeUndefined();
  });

  it("errors when no default language can be determined", async () => {
    languages = [{ isoCode: "en-US" }, { isoCode: "da-DK" }];

    expect(await expectError(undefined)).toContain("no default language could be determined");
  });

  describe("forPublish with mandatory languages", () => {
    it("rejects a page that would be missing the mandatory language, and points at it", async () => {
      languages = [{ isoCode: "en-US", isDefault: true }, { isoCode: "da-DK", isMandatory: true }];

      const message = await expectError(undefined, { forPublish: true });

      expect(message).toContain("Cannot create and publish this page in en-US alone");
      expect(message).toContain("da-DK is a mandatory language");
      expect(message).toContain('pass culture "da-DK"');
      expect(message).toContain("create-variant");
    });

    it("allows the page when its culture is the only mandatory language", async () => {
      languages = [{ isoCode: "en-US", isDefault: true }, { isoCode: "da-DK", isMandatory: true }];

      const result = await resolvePageCulture("doctype", "da-DK", { forPublish: true });

      expect(result).toMatchObject({ ok: true, culture: "da-DK" });
    });

    it("rejects any single culture when several languages are mandatory", async () => {
      languages = [
        { isoCode: "en-US", isDefault: true, isMandatory: true },
        { isoCode: "da-DK", isMandatory: true },
        { isoCode: "nb-NO", isMandatory: true },
      ];

      const message = await expectError("en-US", { forPublish: true });

      expect(message).toContain("da-DK, nb-NO are mandatory languages");
      expect(message).not.toContain("pass culture");
    });

    it("does not apply the mandatory check to a draft (no forPublish)", async () => {
      languages = [{ isoCode: "en-US", isDefault: true }, { isoCode: "da-DK", isMandatory: true }];

      const result = await resolvePageCulture("doctype", undefined);

      expect(result).toMatchObject({ ok: true, culture: "en-US" });
    });
  });
});
