/**
 * Element block fixture — provisions everything needed to exercise the
 * block-on-element tools (`inspect-element-blocks`, `edit-element-block`)
 * against a real Umbraco instance.
 *
 * The demo site ships no Library element type with a block-bearing property, and
 * CI runs against a fresh install, so nothing here is discovered from existing
 * content. Every artefact is created fresh under a random-suffixed alias and
 * torn down by `cleanup()`:
 *
 *   TextBox data type (found, not created)
 *     └─ inner element type          — one Textstring `title`, used as both the
 *                                      block's content AND settings type
 *        └─ BlockList data type      — configured with that element type
 *           └─ Library element type  — allowedInLibrary, one BlockList property
 *              └─ the Library element itself, seeded with one block
 *
 * The seeded block carries deterministic keys so tests can assert on them
 * without first inspecting.
 */

import { randomUUID } from "node:crypto";
import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { ElementTestHelper } from "./element-test-helper.js";

/** Deterministic keys for the seeded block, so tests need no discovery step. */
export const SEEDED_BLOCK_KEY = "33333333-3333-4333-8333-333333333333";
export const SEEDED_SETTINGS_KEY = "44444444-4444-4444-8444-444444444444";
export const SEEDED_CONTENT_VALUE = "_seeded element block value";
export const SEEDED_SETTINGS_VALUE = "_seeded element block settings";
/** A second block with no paired settings entry, for the settings-guard error path. */
export const SEEDED_BLOCK_NO_SETTINGS_KEY = "55555555-5555-4555-8555-555555555555";
export const SEEDED_NO_SETTINGS_CONTENT_VALUE = "_seeded element block value (no settings)";

/** The BlockList property alias on the provisioned Library element type. */
export const BLOCK_PROPERTY_ALIAS = "mainContent";
/** The Textstring property alias inside the block's element type. */
export const BLOCK_INNER_PROPERTY_ALIAS = "title";

export interface ElementBlockFixture {
  /** The Library element containing the seeded block */
  elementId: string;
  /** The element property alias holding the BlockList */
  propertyAlias: string;
  /** The property alias inside the block */
  blockPropertyAlias: string;
  /** The seeded block's contentKey */
  seededBlockKey: string;
  /** The seeded block's settingsKey */
  seededSettingsKey: string;
  /** A second seeded block's contentKey — this one has no paired settings entry */
  seededBlockNoSettingsKey: string;
  /** The element type used for the block's content (and settings) */
  blockElementTypeId: string;
  cleanup(): Promise<void>;
}

async function call(tool: string, args: Record<string, unknown>): Promise<any> {
  const result = await mcpClientManager.callTool("cms", tool, args);
  if (result.isError) {
    throw new Error(`${tool} failed: ${JSON.stringify(extractChainedResult(result))}`);
  }
  return extractChainedResult(result);
}

async function callQuiet(tool: string, args: Record<string, unknown>): Promise<void> {
  try {
    await mcpClientManager.callTool("cms", tool, args);
  } catch {
    // Best-effort teardown.
  }
}

/** The BlockList value seeded onto the element's block property. */
function seededBlockListValue(blockElementTypeId: string) {
  return {
    contentData: [
      {
        key: SEEDED_BLOCK_KEY,
        contentTypeKey: blockElementTypeId,
        values: [
          {
            editorAlias: "Umbraco.TextBox",
            culture: null,
            segment: null,
            alias: BLOCK_INNER_PROPERTY_ALIAS,
            value: SEEDED_CONTENT_VALUE,
          },
        ],
      },
      {
        key: SEEDED_BLOCK_NO_SETTINGS_KEY,
        contentTypeKey: blockElementTypeId,
        values: [
          {
            editorAlias: "Umbraco.TextBox",
            culture: null,
            segment: null,
            alias: BLOCK_INNER_PROPERTY_ALIAS,
            value: SEEDED_NO_SETTINGS_CONTENT_VALUE,
          },
        ],
      },
    ],
    settingsData: [
      {
        key: SEEDED_SETTINGS_KEY,
        contentTypeKey: blockElementTypeId,
        values: [
          {
            editorAlias: "Umbraco.TextBox",
            culture: null,
            segment: null,
            alias: BLOCK_INNER_PROPERTY_ALIAS,
            value: SEEDED_SETTINGS_VALUE,
          },
        ],
      },
    ],
    layout: {
      "Umbraco.BlockList": [
        { contentKey: SEEDED_BLOCK_KEY, settingsKey: SEEDED_SETTINGS_KEY },
        // No settingsKey — this block has no paired settings entry.
        { contentKey: SEEDED_BLOCK_NO_SETTINGS_KEY },
      ],
    },
    expose: [
      { contentKey: SEEDED_BLOCK_KEY, culture: null, segment: null },
      { contentKey: SEEDED_BLOCK_NO_SETTINGS_KEY, culture: null, segment: null },
    ],
  };
}

/**
 * Provision a Library element whose `mainContent` BlockList property holds one
 * seeded block (with settings). Throws if any provisioning step fails — the
 * tools under test have nothing to operate on otherwise, and per the repo's
 * testing rules a missing fixture is a failure, not a skip.
 */
export async function createElementBlockFixture(name: string): Promise<ElementBlockFixture> {
  const suffix = randomUUID().replace(/-/g, "").slice(0, 10);

  // 1 — Textstring data type for the block's inner property. Found, not created,
  //     so we never have to clean it up.
  const textbox = await call("find-data-type", { editorAlias: "Umbraco.TextBox" });
  const textboxId: string | undefined = textbox?.items?.[0]?.id;
  if (!textboxId) {
    throw new Error("No Textstring (Umbraco.TextBox) data type found on this Umbraco instance");
  }

  let blockElementTypeId: string | undefined;
  let blockListDataTypeId: string | undefined;
  let libraryElementTypeId: string | undefined;
  let elementId: string | undefined;

  const cleanup = async () => {
    if (elementId) await ElementTestHelper.cleanup(elementId);
    if (libraryElementTypeId) await callQuiet("delete-document-type", { id: libraryElementTypeId });
    if (blockListDataTypeId) await callQuiet("delete-data-type", { id: blockListDataTypeId });
    if (blockElementTypeId) await callQuiet("delete-document-type", { id: blockElementTypeId });
  };

  try {
    // 2 — Element type used for the block's content and settings.
    const blockElementType = await call("create-element-type", {
      name: `_Test Block Element ${suffix}`,
      alias: `testBlockElement${suffix}`,
      icon: "icon-block",
      compositions: [],
      properties: [
        { name: "Title", alias: BLOCK_INNER_PROPERTY_ALIAS, dataTypeId: textboxId, group: "Content" },
      ],
    });
    blockElementTypeId = blockElementType?.id;
    if (!blockElementTypeId) throw new Error("create-element-type returned no id for the block element type");

    // 3 — BlockList data type wired to that element type, for both content and settings.
    const blockListDataType = await call("create-data-type", {
      name: `_Test Element BlockList ${suffix}`,
      editorAlias: "Umbraco.BlockList",
      editorUiAlias: "Umb.PropertyEditorUi.BlockList",
      values: [
        {
          alias: "blocks",
          value: [
            {
              contentElementTypeKey: blockElementTypeId,
              settingsElementTypeKey: blockElementTypeId,
            },
          ],
        },
      ],
    });
    blockListDataTypeId = blockListDataType?.id;
    if (!blockListDataTypeId) throw new Error("create-data-type returned no id for the BlockList data type");

    // 4 — Library element type exposing the BlockList property.
    const libraryElementType = await call("create-element-type", {
      name: `_Test Library Block Host ${suffix}`,
      alias: `testLibraryBlockHost${suffix}`,
      icon: "icon-plugin",
      compositions: [],
      allowedInLibrary: true,
      properties: [
        { name: "Main content", alias: BLOCK_PROPERTY_ALIAS, dataTypeId: blockListDataTypeId, group: "Content" },
      ],
    });
    libraryElementTypeId = libraryElementType?.id;
    if (!libraryElementTypeId) throw new Error("create-element-type returned no id for the Library element type");

    // 5 — The element itself, seeded with one block.
    const element = await call("create-element", {
      documentTypeId: libraryElementTypeId,
      name,
      values: [
        {
          culture: null,
          segment: null,
          alias: BLOCK_PROPERTY_ALIAS,
          value: seededBlockListValue(blockElementTypeId),
        },
      ],
    });
    elementId = element?.id ?? (await ElementTestHelper.findByName(name))?.id;
    if (!elementId) throw new Error(`create-element did not yield an id for "${name}"`);
  } catch (error) {
    await cleanup();
    throw error;
  }

  return {
    elementId,
    propertyAlias: BLOCK_PROPERTY_ALIAS,
    blockPropertyAlias: BLOCK_INNER_PROPERTY_ALIAS,
    seededBlockKey: SEEDED_BLOCK_KEY,
    seededSettingsKey: SEEDED_SETTINGS_KEY,
    seededBlockNoSettingsKey: SEEDED_BLOCK_NO_SETTINGS_KEY,
    blockElementTypeId,
    cleanup,
  };
}
