import { describe, it, expect } from "@jest/globals";
import { CHAINED_DEPS } from "../chained-deps.generated.js";

describe("chained-deps generated map", () => {
  it("includes the discovery wrappers we expect to need Settings-section dev tools", () => {
    expect(CHAINED_DEPS["list-document-types"]).toEqual(
      expect.arrayContaining([
        "get-document-type-children",
        "get-document-type-root",
        "get-document-type-by-id",
      ]),
    );
    expect(CHAINED_DEPS["get-document-type"]).toEqual(
      expect.arrayContaining(["get-document-type-by-id"]),
    );
    expect(CHAINED_DEPS["list-media-types"]).toBeDefined();
    expect(CHAINED_DEPS["list-blueprints"]).toBeDefined();
  });

  it("includes Translation-section wrappers (dictionary)", () => {
    expect(CHAINED_DEPS["list-dictionary"]).toBeDefined();
    expect(CHAINED_DEPS["search-dictionary"]).toBeDefined();
    expect(CHAINED_DEPS["create-dictionary"]).toBeDefined();
  });

  it("includes Members-section wrappers", () => {
    expect(CHAINED_DEPS["create-member"]).toBeDefined();
    expect(CHAINED_DEPS["create-member-group"]).toBeDefined();
  });

  it("includes content-section wrappers (always available to editors)", () => {
    expect(CHAINED_DEPS["get-page"]).toBeDefined();
    expect(CHAINED_DEPS["create-page"]).toBeDefined();
    expect(CHAINED_DEPS["publish-page"]).toBeDefined();
  });

  it("filtering logic: a tool with one missing dep is excluded", () => {
    const availableDevTools = new Set<string>([
      "get-document-by-id",
      "publish-document",
      "publish-document-with-descendants",
      // intentionally missing get-document-type-by-id
    ]);
    const passes = (toolName: string) => {
      const deps = CHAINED_DEPS[toolName];
      return !deps || deps.every((d) => availableDevTools.has(d));
    };
    expect(passes("publish-page")).toBe(true); // deps satisfied
    expect(passes("get-document-type")).toBe(false); // missing dep
  });
});
