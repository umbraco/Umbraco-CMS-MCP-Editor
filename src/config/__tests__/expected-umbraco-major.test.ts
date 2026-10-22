/**
 * getExpectedUmbracoMajor is the single source of truth for the Umbraco major
 * version this server targets, shared by both the stdio (`src/index.ts`) and
 * hosted (`src/worker.ts`) entry points.
 *
 * It must match @umbraco-cms/mcp-dev's own `?.trim() ||` resolution exactly
 * (not @umbraco-cms/mcp-hosted's `??`), so an override set to an empty or
 * whitespace-only string still falls back to the package's default major.
 */
import { describe, it, expect } from "@jest/globals";
import { getExpectedUmbracoMajor } from "../expected-umbraco-major.js";
import packageJson from "../../../package.json" with { type: "json" };

const defaultMajor = packageJson.version.split(".")[0];

describe("getExpectedUmbracoMajor", () => {
  it("falls back to the package's own major version when no override is given", () => {
    expect(getExpectedUmbracoMajor()).toBe(defaultMajor);
    expect(getExpectedUmbracoMajor(undefined)).toBe(defaultMajor);
  });

  it("uses an explicit override", () => {
    expect(getExpectedUmbracoMajor("17")).toBe("17");
  });

  it("trims surrounding whitespace from an override", () => {
    expect(getExpectedUmbracoMajor("  17  ")).toBe("17");
  });

  it("falls back to the default when the override is an empty string", () => {
    // `?.trim() ||`, not `??` — matches @umbraco-cms/mcp-dev's own resolution,
    // not @umbraco-cms/mcp-hosted's (that gap is umbraco/Umbraco-MCP-Base#426).
    expect(getExpectedUmbracoMajor("")).toBe(defaultMajor);
  });

  it("falls back to the default when the override is whitespace-only", () => {
    expect(getExpectedUmbracoMajor("   ")).toBe(defaultMajor);
  });
});
