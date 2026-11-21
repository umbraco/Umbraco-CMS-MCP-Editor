/**
 * Unit tests for the Library block helpers. Pure — no CMS needed.
 *
 * `getBlockedTransferVariants` is a port of the back office's
 * `umbGetBlockedTransferVariants` (Umbraco 19, block/utils/
 * block-transfer-variants.function.ts); these cases pin it to the same rules,
 * since the integration tests' API user can access every language and so
 * can't exercise the refusal path.
 */

import { describe, it, expect } from "@jest/globals";
import {
  blockValueCultures,
  getBlockedTransferVariants,
  unpublishedCulturesOf,
  type LanguageAccess,
} from "../library-blocks.js";

const ALL: LanguageAccess = { hasAccessToAllLanguages: true, languages: [], hasAccessToInvariantForVariant: true };
const EN_ONLY: LanguageAccess = { hasAccessToAllLanguages: false, languages: ["en-US"], hasAccessToInvariantForVariant: true };

describe("blockValueCultures", () => {
  it("lists the culture of every value that holds data, null for shared values", () => {
    expect(blockValueCultures([
      { alias: "title", culture: "en-US", value: "Hello" },
      { alias: "title", culture: "da-DK", value: "Hej" },
      { alias: "image", culture: null, value: [{ key: "x" }] },
    ])).toEqual(["en-US", "da-DK", null]);
  });

  it("ignores empty values, like the back office", () => {
    expect(blockValueCultures([
      { alias: "title", culture: "da-DK", value: "" },
      { alias: "flag", culture: null, value: false },
      { alias: "list", culture: "en-US", value: [] },
      { alias: "none", culture: "en-US", value: null },
    ])).toEqual([]);
  });
});

describe("getBlockedTransferVariants (port of the back office rule)", () => {
  it("allows everything for a user with access to all languages", () => {
    expect(getBlockedTransferVariants({ valueCultures: ["en-US", "da-DK", null], variesByCulture: true, access: ALL }))
      .toEqual({ cultures: [], invariant: false });
  });

  it("blocks the languages the user can't edit, de-duplicated", () => {
    expect(getBlockedTransferVariants({ valueCultures: ["en-US", "da-DK", "da-DK", "nb-NO"], variesByCulture: true, access: EN_ONLY }))
      .toEqual({ cultures: ["da-DK", "nb-NO"], invariant: false });
  });

  it("blocks shared content of a culture-variant block when the user can't edit invariant content", () => {
    const access = { ...ALL, hasAccessToInvariantForVariant: false };
    expect(getBlockedTransferVariants({ valueCultures: [null], variesByCulture: true, access }))
      .toEqual({ cultures: [], invariant: true });
  });

  it("does not treat shared content of an invariant block as blocked", () => {
    const access = { ...EN_ONLY, hasAccessToInvariantForVariant: false };
    expect(getBlockedTransferVariants({ valueCultures: [null], variesByCulture: false, access }))
      .toEqual({ cultures: [], invariant: false });
  });
});

describe("unpublishedCulturesOf", () => {
  it("applies an invariant Element's single state to every culture", () => {
    const variants = [{ culture: null, name: "Promo", state: "Draft" }];
    expect(unpublishedCulturesOf(variants, ["en-US", "da-DK"])).toEqual(["en-US", "da-DK"]);
    expect(unpublishedCulturesOf([{ culture: null, name: "Promo", state: "Published" }], ["en-US"])).toEqual([]);
  });

  it("checks each culture of a culture-variant Element separately", () => {
    const variants = [
      { culture: "en-US", name: "Promo", state: "Published" },
      { culture: "da-DK", name: "Promo DA", state: "Draft" },
    ];
    expect(unpublishedCulturesOf(variants, ["en-US", "da-DK"])).toEqual(["da-DK"]);
  });

  it("counts a language the Element doesn't have at all as unpublished", () => {
    const variants = [{ culture: "en-US", name: "Promo", state: "PublishedPendingChanges" }];
    expect(unpublishedCulturesOf(variants, ["en-US", "nb-NO"])).toEqual(["nb-NO"]);
  });
});
