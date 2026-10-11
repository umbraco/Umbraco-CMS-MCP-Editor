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
  const SETTINGS_ELEMENT_TYPE_KEY = "dddddddd-4444-4444-8444-444444444444";
  const NESTED_CONTENT_KEY = "eeeeeeee-5555-4555-8555-555555555555";
  const NESTED_ELEMENT_TYPE_KEY = "ffffffff-6666-4666-8666-666666666666";

  const docValues = [
    { alias: "title", editorAlias: "Umbraco.TextBox", value: "not a block" },
    { alias: "mainContent", editorAlias: "Umbraco.BlockList", value: blockListValue() },
  ];

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
    expect(enrichBlockNotFoundError(errorResult, docValues, "mainContent")).toBe(errorResult);
  });

  it("sets contentTypeKey to null when an availableBlocks entry's key matches no known block", () => {
    const errorResult = blocksNotFoundError([{ key: "unknown-key", type: "content", path: "x" }]);
    const result = enrichBlockNotFoundError(errorResult, docValues, "mainContent");
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
    const result = enrichBlockNotFoundError(errorResult, docValues, "mainContent");
    const problem = JSON.parse(result.content[0].text as string);
    expect(problem.availableBlocks).toEqual(malformed);
  });

  it("merges the matching block's contentTypeKey on the happy path", () => {
    const errorResult = blocksNotFoundError([{ key: CONTENT_KEY, type: "content", path: "mainContent" }]);
    const result = enrichBlockNotFoundError(errorResult, docValues, "mainContent");
    const problem = JSON.parse(result.content[0].text as string);
    expect(problem.availableBlocks).toEqual([
      { key: CONTENT_KEY, type: "content", path: "mainContent", contentTypeKey: ELEMENT_TYPE_KEY },
    ]);
  });

  it("only looks at the targeted property, ignoring blocks on a differently-named one", () => {
    const errorResult = blocksNotFoundError([{ key: CONTENT_KEY, type: "content", path: "mainContent" }]);
    const result = enrichBlockNotFoundError(errorResult, docValues, "sidebar");
    const problem = JSON.parse(result.content[0].text as string);
    expect(problem.availableBlocks).toEqual([
      { key: CONTENT_KEY, type: "content", path: "mainContent", contentTypeKey: null },
    ]);
  });

  it("labels a settings entry's contentTypeKey, not just content blocks", () => {
    const valueWithSettings = {
      alias: "mainContent",
      editorAlias: "Umbraco.BlockList",
      value: {
        contentData: [blockEntry()],
        settingsData: [{ key: SETTINGS_KEY, contentTypeKey: SETTINGS_ELEMENT_TYPE_KEY, values: [] }],
        layout: { "Umbraco.BlockList": [{ contentKey: CONTENT_KEY, settingsKey: SETTINGS_KEY }] },
        expose: [{ contentKey: CONTENT_KEY, culture: null, segment: null }],
      },
    };
    const errorResult = blocksNotFoundError([
      { key: CONTENT_KEY, type: "content", path: "mainContent" },
      { key: SETTINGS_KEY, type: "settings", path: "mainContent" },
    ]);
    const result = enrichBlockNotFoundError(errorResult, [valueWithSettings], "mainContent");
    const problem = JSON.parse(result.content[0].text as string);
    expect(problem.availableBlocks).toEqual([
      { key: CONTENT_KEY, type: "content", path: "mainContent", contentTypeKey: ELEMENT_TYPE_KEY },
      { key: SETTINGS_KEY, type: "settings", path: "mainContent", contentTypeKey: SETTINGS_ELEMENT_TYPE_KEY },
    ]);
  });

  it("labels a block nested inside another block's own property value", () => {
    const valueWithNested = {
      alias: "mainContent",
      editorAlias: "Umbraco.BlockList",
      value: {
        contentData: [{
          key: CONTENT_KEY,
          contentTypeKey: ELEMENT_TYPE_KEY,
          values: [
            { alias: "title", value: "Hello" },
            {
              alias: "nestedBlocks",
              value: {
                contentData: [{ key: NESTED_CONTENT_KEY, contentTypeKey: NESTED_ELEMENT_TYPE_KEY, values: [] }],
                settingsData: [],
                layout: { "Umbraco.BlockList": [{ contentKey: NESTED_CONTENT_KEY }] },
                expose: [],
              },
            },
          ],
        }],
        settingsData: [],
        layout: { "Umbraco.BlockList": [{ contentKey: CONTENT_KEY }] },
        expose: [{ contentKey: CONTENT_KEY, culture: null, segment: null }],
      },
    };
    const errorResult = blocksNotFoundError([
      { key: NESTED_CONTENT_KEY, type: "content", path: "mainContent.contentData[0].values[1](nestedBlocks)" },
    ]);
    const result = enrichBlockNotFoundError(errorResult, [valueWithNested], "mainContent");
    const problem = JSON.parse(result.content[0].text as string);
    expect(problem.availableBlocks[0].contentTypeKey).toBe(NESTED_ELEMENT_TYPE_KEY);
  });

  it("adds a note that settings keys aren't valid contentKey input when requested", () => {
    const errorResult = blocksNotFoundError([{ key: CONTENT_KEY, type: "content", path: "mainContent" }]);
    const withoutNote = enrichBlockNotFoundError(errorResult, docValues, "mainContent");
    expect(JSON.parse(withoutNote.content[0].text as string).note).toBeUndefined();

    const withNote = enrichBlockNotFoundError(errorResult, docValues, "mainContent", { noteSettingsKeys: true });
    expect(JSON.parse(withNote.content[0].text as string).note).toMatch(/settings/i);
  });

  it("caps the enriched list and notes the truncation when there are many blocks", () => {
    const manyBlocks = Array.from({ length: 60 }, (_, i) => ({ key: `block-${i}`, type: "content", path: "mainContent" }));
    const errorResult = blocksNotFoundError(manyBlocks);
    const result = enrichBlockNotFoundError(errorResult, docValues, "mainContent");
    const problem = JSON.parse(result.content[0].text as string);
    expect(problem.availableBlocks).toHaveLength(50);
    expect(problem.note).toMatch(/first 50 of 60/);
  });
});
