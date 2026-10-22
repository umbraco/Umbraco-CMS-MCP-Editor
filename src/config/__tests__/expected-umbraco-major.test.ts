/**
 * Pure unit tests for getExpectedUmbracoMajor — no live Umbraco needed.
 *
 * `override?.trim() || UMBRACO_TARGET_MAJOR` must match
 * @umbraco-cms/mcp-dev's own `process.env.UMBRACO_EXPECTED_MAJOR?.trim() ||
 * UMBRACO_TARGET_MAJOR` — an override that is empty or whitespace-only falls
 * back to the generated default rather than disabling the check.
 */

import { describe, it, expect } from "@jest/globals";
import { getExpectedUmbracoMajor } from "../expected-umbraco-major.js";
import { UMBRACO_TARGET_MAJOR } from "../umbraco-target.generated.js";

describe("getExpectedUmbracoMajor", () => {
  const defaultMajor = UMBRACO_TARGET_MAJOR;

  it("returns the generated target major when no override is given", () => {
    expect(getExpectedUmbracoMajor()).toBe(defaultMajor);
    expect(getExpectedUmbracoMajor(undefined)).toBe(defaultMajor);
  });

  it("returns the trimmed override when one is present", () => {
    expect(getExpectedUmbracoMajor("17")).toBe("17");
    expect(getExpectedUmbracoMajor("  17  ")).toBe("17");
  });

  it("falls back to the default when the override is blank or whitespace-only", () => {
    expect(getExpectedUmbracoMajor("")).toBe(defaultMajor);
    expect(getExpectedUmbracoMajor("   ")).toBe(defaultMajor);
  });
});
