/**
 * Unit tests for the #198 block-update helpers (v17 line). The v18 line tests
 * these alongside its larger block-inspector module.
 */
import { describe, it, expect } from "@jest/globals";
import { createToolResultError } from "@umbraco-cms/mcp-server-sdk";
import {
  blockPropertyAliasSchema,
  classifyBlockUpdateResults,
  enrichBlockNotFoundError,
} from "../block-inspector.js";

// Shared fixtures, as in the v18 line's block-inspector tests.

const CONTENT_KEY = "aaaaaaaa-1111-4111-8111-111111111111";
const SETTINGS_KEY = "bbbbbbbb-2222-4222-8222-222222222222";
const ELEMENT_TYPE_KEY = "cccccccc-3333-4333-8333-333333333333";

function blockEntry(key = CONTENT_KEY) {
  return {
    key,
    contentTypeKey: ELEMENT_TYPE_KEY,
    values: [{ alias: "title", value: "Hello", editorAlias: "Umbraco.TextBox" }],
  };
}

function blockListValue(layoutEntry: Record<string, unknown> = { contentKey: CONTENT_KEY }) {
  return {
    contentData: [blockEntry()],
    settingsData: [],
    layout: { "Umbraco.BlockList": [layoutEntry] },
    expose: [{ contentKey: CONTENT_KEY, culture: null, segment: null }],
  };
}


describe("enrichBlockNotFoundError", () => {
  const SETTINGS_TYPE_KEY = "dddddddd-5555-4555-8555-555555555555";
  const NESTED_CONTENT_KEY = "eeeeeeee-6666-4666-8666-666666666666";
  const NESTED_TYPE_KEY = "ffffffff-7777-4777-8777-777777777777";

  const values = [{ alias: "mainContent", value: blockListValue({ contentKey: CONTENT_KEY }) }];

  function blocksNotFoundError(availableBlocks: unknown[]) {
    return createToolResultError({
      type: "Error",
      title: "Blocks not found",
      status: 404,
      availableBlocks,
    });
  }

  it("returns the error unchanged when it isn't the \"Blocks not found\" shape", () => {
    // No `availableBlocks` array at all — e.g. a plain "Property not found" error.
    const errorResult = createToolResultError({ type: "Error", title: "Property not found", status: 404 });
    expect(enrichBlockNotFoundError(errorResult, values)).toBe(errorResult);
  });

  it("sets contentTypeKey to null when an availableBlocks entry's key matches no known block", () => {
    const errorResult = blocksNotFoundError([{ key: "unknown-key", type: "content", path: "x" }]);
    const result = enrichBlockNotFoundError(errorResult, values);
    const problem = JSON.parse(result.content[0].text as string);
    expect(problem.availableBlocks).toEqual([
      { key: "unknown-key", type: "content", path: "x", contentTypeKey: null },
    ]);
  });

  it("passes a malformed availableBlocks entry through unchanged", () => {
    // Not an object, or an object missing a string `key` — the function's own
    // `typeof (b as {key}).key === "string"` guard should leave these as-is.
    const malformed = ["a string entry", 42, null, { type: "content" }, { key: 123 }];
    const errorResult = blocksNotFoundError(malformed);
    const result = enrichBlockNotFoundError(errorResult, values);
    const problem = JSON.parse(result.content[0].text as string);
    expect(problem.availableBlocks).toEqual(malformed);
  });

  it("merges the matching block's contentTypeKey on the happy path", () => {
    const errorResult = blocksNotFoundError([{ key: CONTENT_KEY, type: "content", path: "mainContent" }]);
    const result = enrichBlockNotFoundError(errorResult, values, { propertyAlias: "mainContent" });
    const problem = JSON.parse(result.content[0].text as string);
    expect(problem.availableBlocks).toEqual([
      { key: CONTENT_KEY, type: "content", path: "mainContent", contentTypeKey: ELEMENT_TYPE_KEY },
    ]);
  });

  it("resolves a settings entry's contentTypeKey from settingsData", () => {
    const withSettings = [{
      alias: "mainContent",
      value: {
        contentData: [blockEntry()],
        settingsData: [{ key: SETTINGS_KEY, contentTypeKey: SETTINGS_TYPE_KEY, values: [] }],
        layout: { "Umbraco.BlockList": [{ contentKey: CONTENT_KEY, settingsKey: SETTINGS_KEY }] },
        expose: [{ contentKey: CONTENT_KEY, culture: null, segment: null }],
      },
    }];
    const errorResult = blocksNotFoundError([{ key: SETTINGS_KEY, type: "settings", path: "mainContent" }]);
    const result = enrichBlockNotFoundError(errorResult, withSettings, { propertyAlias: "mainContent" });
    const problem = JSON.parse(result.content[0].text as string);
    expect(problem.availableBlocks).toEqual([
      { key: SETTINGS_KEY, type: "settings", path: "mainContent", contentTypeKey: SETTINGS_TYPE_KEY },
    ]);
  });

  it("resolves a block-in-block's contentTypeKey by walking nested block values", () => {
    const withNestedBlock = [{
      alias: "mainContent",
      value: {
        contentData: [{
          key: CONTENT_KEY,
          contentTypeKey: ELEMENT_TYPE_KEY,
          values: [{
            alias: "innerBlocks",
            value: {
              contentData: [{ key: NESTED_CONTENT_KEY, contentTypeKey: NESTED_TYPE_KEY, values: [] }],
              settingsData: [],
              layout: { "Umbraco.BlockList": [{ contentKey: NESTED_CONTENT_KEY }] },
              expose: [],
            },
          }],
        }],
        settingsData: [],
        layout: { "Umbraco.BlockList": [{ contentKey: CONTENT_KEY }] },
        expose: [{ contentKey: CONTENT_KEY, culture: null, segment: null }],
      },
    }];
    const errorResult = blocksNotFoundError([{ key: NESTED_CONTENT_KEY, type: "content", path: "mainContent" }]);
    const result = enrichBlockNotFoundError(errorResult, withNestedBlock, { propertyAlias: "mainContent" });
    const problem = JSON.parse(result.content[0].text as string);
    expect(problem.availableBlocks).toEqual([
      { key: NESTED_CONTENT_KEY, type: "content", path: "mainContent", contentTypeKey: NESTED_TYPE_KEY },
    ]);
  });

  it("caps the enriched list and notes how many entries were omitted", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ key: `k${i}`, type: "content", path: "x" }));
    const errorResult = blocksNotFoundError(many);
    const result = enrichBlockNotFoundError(errorResult, values);
    const problem = JSON.parse(result.content[0].text as string);
    expect(problem.availableBlocks).toHaveLength(50);
    expect(problem.availableBlocksNote).toContain("50 of 60");
  });

  it("passes through an optional note", () => {
    const errorResult = blocksNotFoundError([{ key: CONTENT_KEY, type: "content", path: "mainContent" }]);
    const result = enrichBlockNotFoundError(errorResult, values, { propertyAlias: "mainContent", note: "test note" });
    const problem = JSON.parse(result.content[0].text as string);
    expect(problem.note).toBe("test note");
  });

  it("stops recursing past the block-in-block depth cap rather than walking indefinitely", () => {
    // Builds a block nested inside a block nested inside a block, 26 levels
    // deep — well past MAX_BLOCK_WALK_DEPTH (20) — to pin that the walk bails
    // out rather than resolving arbitrarily deep nesting (or, on a malicious
    // document, spending unbounded CPU on it).
    function buildChain(level: number): unknown {
      const inner = level < 25 ? buildChain(level + 1) : null;
      return {
        contentData: [{
          key: `chain-${level}`,
          contentTypeKey: `type-${level}`,
          values: inner ? [{ alias: "innerBlocks", value: inner }] : [],
        }],
        settingsData: [],
        layout: { "Umbraco.BlockList": [{ contentKey: `chain-${level}` }] },
        expose: [],
      };
    }
    const chainValues = [{ alias: "mainContent", value: buildChain(0) }];
    const errorResult = blocksNotFoundError([
      { key: "chain-20", type: "content", path: "mainContent" },
      { key: "chain-21", type: "content", path: "mainContent" },
    ]);
    const result = enrichBlockNotFoundError(errorResult, chainValues, { propertyAlias: "mainContent" });
    const problem = JSON.parse(result.content[0].text as string);
    const byKey = Object.fromEntries(problem.availableBlocks.map((b: any) => [b.key, b.contentTypeKey]));
    expect(byKey["chain-20"]).toBe("type-20");
    expect(byKey["chain-21"]).toBeNull();
  });
});

describe("classifyBlockUpdateResults", () => {
  it("classifies a fully successful result as clean", () => {
    const result = classifyBlockUpdateResults(
      [{ success: true, message: "Updated 2 properties", updatedCount: 2 }],
      2,
    );
    expect(result.outcome).toBe("clean");
    expect(result.processedCount).toBe(2);
    expect(result.updatedEntryCount).toBe(1);
  });

  it("classifies a result with one valid and one invalid alias as partial, not clean", () => {
    // Upstream's `success: totalProcessed > 0 || errors.length === 0` means
    // this result still reads `success: true` despite the populated `errors`.
    const result = classifyBlockUpdateResults(
      [{ success: true, message: "Updated 1 properties", updatedCount: 1, errors: ["Property 'bad' does not exist on Element Type"] }],
      2,
    );
    expect(result.outcome).toBe("partial");
    expect(result.processedCount).toBe(1);
    expect(result.detail).toContain("does not exist on Element Type");
  });

  it("classifies success: true with no errors but nothing processed as failed, not a false clean success", () => {
    // The gap upstream's formula leaves open: totalProcessed === 0 and
    // errors.length === 0 still yields success: true (e.g. an alias that only
    // produced a warnings entry because the element type couldn't be resolved).
    const result = classifyBlockUpdateResults(
      [{ success: true, message: "No properties were processed", warnings: ["Property 'x' not found in block (could not validate against Element Type)"] }],
      1,
    );
    expect(result.outcome).toBe("failed");
    expect(result.processedCount).toBe(0);
    expect(result.detail).toContain("could not validate");
  });

  it("classifies an explicit success: false result as failed", () => {
    const result = classifyBlockUpdateResults(
      [{ success: false, message: "Block with contentKey 'x' not found" }],
      1,
    );
    expect(result.outcome).toBe("failed");
  });

  it("treats fewer result entries than requested as partial, even when every returned entry is clean", () => {
    // If the chained tool ever returns fewer results than blocks were asked
    // for, processedCount can't reach requestedCount, so this isn't silently
    // read as a full success.
    const result = classifyBlockUpdateResults(
      [{ success: true, message: "Updated 1 properties", updatedCount: 1 }],
      2,
      [],
      2, // expectedEntryCount: 2 blocks were requested, only 1 entry came back
    );
    expect(result.outcome).toBe("partial");
    expect(result.unresolvedBlockCount).toBe(1);
  });

  it("classifies an empty or missing results array as failed", () => {
    expect(classifyBlockUpdateResults([], 1).outcome).toBe("failed");
    expect(classifyBlockUpdateResults(undefined, 1).outcome).toBe("failed");
  });

  it("collects warnings across every result even on a clean outcome", () => {
    const result = classifyBlockUpdateResults(
      [{ success: true, message: "Updated 1 properties", updatedCount: 1, warnings: ["some warning"] }],
      1,
    );
    expect(result.outcome).toBe("clean");
    expect(result.warnings).toEqual(["some warning"]);
  });

  it("splits requested aliases into savedFields/failedFields by matching the quoted alias in errors", () => {
    const result = classifyBlockUpdateResults(
      [{ success: true, message: "Updated 1 properties", updatedCount: 1, errors: ["Property 'bad' does not exist on Element Type"] }],
      2,
      ["good", "bad"],
    );
    expect(result.savedFields).toEqual(["good"]);
    expect(result.failedFields).toEqual(["bad"]);
  });

  it("does not mistake a saved alias for a substring of a different, failed alias's quoted mention", () => {
    // The dangerous direction: the FAILING alias ("subtitle") textually
    // contains the SAVED alias ("title") as a substring. A naive
    // `failureText.includes(alias)` with no quote boundary would wrongly
    // match "title" inside "...'subtitle'..." and misreport it as failed.
    // Quote-anchoring (`'${alias}'`) avoids this because no quote character
    // sits directly before "title" within "subtitle".
    const result = classifyBlockUpdateResults(
      [{ success: true, message: "Updated 1 properties", updatedCount: 1, errors: ["Property 'subtitle' does not exist on Element Type"] }],
      2,
      ["title", "subtitle"],
    );
    expect(result.savedFields).toEqual(["title"]);
    expect(result.failedFields).toEqual(["subtitle"]);
  });

  it("zeroes out savedFields when a block-level entry never reached the per-property loop, even if another block resolved cleanly", () => {
    // Upstream's "Block with contentKey 'x' not found in contentData" entry
    // carries no updatedCount/addedCount/errors/warnings at all, so no
    // requested alias is ever named as failed for it — without
    // unresolvedBlockCount, every alias would default into savedFields even
    // though this block was never written to.
    const result = classifyBlockUpdateResults(
      [
        { success: true, message: "Updated 1 properties", updatedCount: 1 },
        { success: false, message: "Block with contentKey 'missing-key' not found in contentData" },
      ],
      2,
      ["title"],
      2,
    );
    expect(result.outcome).toBe("partial");
    expect(result.unresolvedBlockCount).toBe(1);
    expect(result.savedFields).toEqual([]);
    expect(result.detail).toContain("not found in contentData");
  });

  it("zeroes out savedFields when the chained tool returns fewer entries than blocks were requested, even with aliases passed", () => {
    // The entry that DID come back is fully clean (no errors/warnings), so
    // the alias-matching logic alone would put every requested alias in
    // savedFields. The missing second block's entry was never attempted, so
    // that would overclaim.
    const result = classifyBlockUpdateResults(
      [{ success: true, message: "Updated 1 properties", updatedCount: 1 }],
      2,
      ["title"],
      2,
    );
    expect(result.outcome).toBe("partial");
    expect(result.unresolvedBlockCount).toBe(1);
    expect(result.savedFields).toEqual([]);
  });

  it("returns empty savedFields/failedFields when no requestedAliases are passed", () => {
    const result = classifyBlockUpdateResults(
      [{ success: true, message: "Updated 1 properties", updatedCount: 1, errors: ["Property 'bad' does not exist on Element Type"] }],
      2,
    );
    expect(result.savedFields).toEqual([]);
    expect(result.failedFields).toEqual([]);
  });
});

describe("blockPropertyAliasSchema", () => {
  it("accepts ordinary camelCase and underscore-prefixed aliases", () => {
    expect(blockPropertyAliasSchema.safeParse("title").success).toBe(true);
    expect(blockPropertyAliasSchema.safeParse("mainContent").success).toBe(true);
    expect(blockPropertyAliasSchema.safeParse("_notARealPropertyAliasOnThisElementType").success).toBe(true);
  });

  it("rejects a quote character, which would let a crafted alias forge a collision in classifyBlockUpdateResults' matching", () => {
    // e.g. alias `a', 'foo` would make upstream emit `Property 'a', 'foo' does
    // not exist...`, whose text contains the literal substring `'foo'` and so
    // would wrongly flag an unrelated, successfully-saved "foo" alias as failed.
    expect(blockPropertyAliasSchema.safeParse("a', 'foo").success).toBe(false);
    expect(blockPropertyAliasSchema.safeParse("has'quote").success).toBe(false);
  });

  it("rejects other characters a real Umbraco property alias can't contain", () => {
    expect(blockPropertyAliasSchema.safeParse("has space").success).toBe(false);
    expect(blockPropertyAliasSchema.safeParse("has.dot").success).toBe(false);
    expect(blockPropertyAliasSchema.safeParse("").success).toBe(false);
  });
});
