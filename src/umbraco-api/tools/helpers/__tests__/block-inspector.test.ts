/**
 * Unit tests for the shared block-inspector helper.
 *
 * These tests are pure — they do not hit the CMS, so they run without a live
 * Umbraco instance. They pin the value shapes that inspect-blocks (documents)
 * and inspect-element-blocks (Library elements) both depend on.
 */

import { describe, it, expect } from "@jest/globals";
import {
  collectBlockProperties,
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
