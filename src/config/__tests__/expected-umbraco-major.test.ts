/**
 * Pure unit tests for getExpectedUmbracoMajor — no live Umbraco needed.
 *
 * `override?.trim() || packageJson.version.split(".")[0]` must match
 * @umbraco-cms/mcp-dev's own `process.env.UMBRACO_EXPECTED_MAJOR?.trim() ||
 * UMBRACO_TARGET_MAJOR` — an override that is empty or whitespace-only falls
 * back to the package-version default rather than disabling the check.
 */

import { describe, it, expect } from "@jest/globals";
import packageJson from "../../../package.json" with { type: "json" };
import { getExpectedUmbracoMajor } from "../expected-umbraco-major.js";

describe("getExpectedUmbracoMajor", () => {
  const defaultMajor = packageJson.version.split(".")[0];

  it("returns the package-version major when no override is given", () => {
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
