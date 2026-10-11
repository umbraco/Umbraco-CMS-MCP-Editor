/**
 * Unit tests for the shared block-inspector helper.
 *
 * These tests are pure — they do not hit the CMS, so they run without a live
 * Umbraco instance. They pin the value shapes that inspect-blocks (documents)
 * and inspect-element-blocks (Library elements) both depend on.
 */

import { describe, it, expect } from "@jest/globals";
import { createToolResultError } from "@umbraco-cms/mcp-server-sdk";
import {
  classifyBlockUpdateResults,
  collectBlockProperties,
  enrichBlockNotFoundError,
  extractBlocks,
  findSettingsKey,
  isBlockListOrGridValue,
  isRteWithBlocks,
} from "../block-inspector.js";

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

describe("block-inspector shape predicates", () => {
  it("recognises a BlockList/BlockGrid value by its contentData array", () => {
    expect(isBlockListOrGridValue(blockListValue())).toBe(true);
    expect(isBlockListOrGridValue({ markup: "<p>x</p>" })).toBe(false);
    expect(isBlockListOrGridValue(null)).toBe(false);
    expect(isBlockListOrGridValue("plain string")).toBe(false);
    expect(isBlockListOrGridValue([])).toBe(false);
  });

  it("recognises an RTE-with-blocks value by markup plus nested contentData", () => {
    expect(isRteWithBlocks({ markup: "<p>x</p>", blocks: blockListValue() })).toBe(true);
    // Markup with no blocks is a plain RTE, not a block-bearing property.
    expect(isRteWithBlocks({ markup: "<p>x</p>", blocks: null })).toBe(false);
    expect(isRteWithBlocks(blockListValue())).toBe(false);
  });
});

describe("extractBlocks", () => {
  it("flattens contentData into contentKey / contentTypeKey / properties", () => {
    expect(extractBlocks([blockEntry()])).toEqual([
      {
        contentKey: CONTENT_KEY,
        contentTypeKey: ELEMENT_TYPE_KEY,
        properties: [{ alias: "title", value: "Hello" }],
      },
    ]);
  });

  it("tolerates a malformed block entry rather than throwing", () => {
    expect(extractBlocks([{}])).toEqual([
      { contentKey: "", contentTypeKey: "", properties: [] },
    ]);
  });
});

describe("findSettingsKey", () => {
  it("returns the settings key paired with a block in a flat layout", () => {
    const value = blockListValue({ contentKey: CONTENT_KEY, settingsKey: SETTINGS_KEY });
    expect(findSettingsKey(value, CONTENT_KEY)).toBe(SETTINGS_KEY);
  });

  it("returns undefined when the block has no settings entry", () => {
    expect(findSettingsKey(blockListValue(), CONTENT_KEY)).toBeUndefined();
    expect(findSettingsKey(blockListValue({ contentKey: CONTENT_KEY, settingsKey: "" }), CONTENT_KEY)).toBeUndefined();
  });

  it("returns undefined for an unknown block key or a value with no layout", () => {
    expect(findSettingsKey(blockListValue(), "unknown-key")).toBeUndefined();
    expect(findSettingsKey({ contentData: [] }, CONTENT_KEY)).toBeUndefined();
    expect(findSettingsKey(null, CONTENT_KEY)).toBeUndefined();
  });

  it("finds a block nested inside a BlockGrid area", () => {
    const value = {
      contentData: [blockEntry()],
      layout: {
        "Umbraco.BlockGrid": [
          {
            contentKey: "dddddddd-4444-4444-8444-444444444444",
            areas: [
              { key: "area-1", items: [{ contentKey: CONTENT_KEY, settingsKey: SETTINGS_KEY }] },
            ],
          },
        ],
      },
    };
    expect(findSettingsKey(value, CONTENT_KEY)).toBe(SETTINGS_KEY);
  });
});

describe("collectBlockProperties", () => {
  it("returns only block-bearing properties, with the settings key attached", () => {
    const result = collectBlockProperties([
      { alias: "title", editorAlias: "Umbraco.TextBox", value: "not a block" },
      {
        alias: "mainContent",
        editorAlias: "Umbraco.BlockList",
        value: blockListValue({ contentKey: CONTENT_KEY, settingsKey: SETTINGS_KEY }),
      },
    ]);

    expect(result).toEqual([
      {
        propertyAlias: "mainContent",
        editorAlias: "Umbraco.BlockList",
        blocks: [
          {
            contentKey: CONTENT_KEY,
            contentTypeKey: ELEMENT_TYPE_KEY,
            settingsKey: SETTINGS_KEY,
            properties: [{ alias: "title", value: "Hello" }],
          },
        ],
      },
    ]);
  });

  it("omits settingsKey entirely when the block has no settings", () => {
    const [property] = collectBlockProperties([
      { alias: "mainContent", editorAlias: "Umbraco.BlockList", value: blockListValue() },
    ]);
    expect(property.blocks[0]).not.toHaveProperty("settingsKey");
  });

  it("reports RTE-with-blocks as Umbraco.RichText and reads the nested container", () => {
    const result = collectBlockProperties([
      {
        alias: "body",
        value: {
          markup: `<umb-rte-block data-content-key="${CONTENT_KEY}"></umb-rte-block>`,
          blocks: blockListValue({ contentKey: CONTENT_KEY, settingsKey: SETTINGS_KEY }),
        },
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].editorAlias).toBe("Umbraco.RichText");
    expect(result[0].blocks[0].contentKey).toBe(CONTENT_KEY);
    expect(result[0].blocks[0].settingsKey).toBe(SETTINGS_KEY);
  });

  it("narrows to a single property when propertyAlias is supplied", () => {
    const values = [
      { alias: "mainContent", editorAlias: "Umbraco.BlockList", value: blockListValue() },
      { alias: "sidebar", editorAlias: "Umbraco.BlockList", value: blockListValue() },
    ];
    expect(collectBlockProperties(values, "sidebar")).toHaveLength(1);
    expect(collectBlockProperties(values, "sidebar")[0].propertyAlias).toBe("sidebar");
    expect(collectBlockProperties(values, "nope")).toEqual([]);
  });
});

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
    );
    expect(result.outcome).toBe("partial");
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

  it("does not mistake one alias for a substring of another when splitting fields", () => {
    const result = classifyBlockUpdateResults(
      [{ success: true, message: "Updated 1 properties", updatedCount: 1, errors: ["Property 'title' does not exist on Element Type"] }],
      2,
      ["subtitle", "title"],
    );
    expect(result.savedFields).toEqual(["subtitle"]);
    expect(result.failedFields).toEqual(["title"]);
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
