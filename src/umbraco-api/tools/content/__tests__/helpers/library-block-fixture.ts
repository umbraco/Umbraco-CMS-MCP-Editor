/**
 * Library block fixtures — provision everything the Library block tools need
 * (Umbraco 19 reusable content) on a fresh Umbraco install, then create a
 * deterministic page to operate on.
 *
 * Invariant (`createLibraryBlockFixture`):
 * - an element type with `allowedInLibrary: true` (one TextBox "title"), also
 *   used as the block's *settings* element type, so tests can check that
 *   settings stay local to the page,
 * - a BlockList data type allowing it (with settings), and a root doc type,
 * - a page with one exposed local block carrying content + settings.
 *
 * Multilingual (`createMultilingualLibraryBlockFixture`):
 * - a second language (reuses any existing one, else adds nb-NO — the same
 *   convention the translation tests use, and likewise left in place),
 * - a culture-variant, Library-enabled element type and a culture-variant host
 *   doc type whose BlockList property is shared (block-level variance),
 * - a page in both languages with one block holding content in both cultures
 *   and exposed in both.
 *
 * The Clean starter kit has no Library-enabled or culture-variant element
 * types, so nothing here can come from a donor page. Provisioning is
 * idempotent (find-then-create); each fixture page and every Element a test
 * creates are cleaned up by ID.
 */

import { randomUUID } from "node:crypto";
import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { ContentBuilder } from "./content-builder.js";
import { ContentTestHelper } from "./content-test-helper.js";

const TEXTBOX_NAME = "_Audit library textbox";
const ELEMENT_TYPE_NAME = "_Audit library element";
const ELEMENT_TYPE_ALIAS = "_auditLibraryElement";
const BLOCKLIST_NAME = "_Audit library blocklist with settings";
const DOCTYPE_NAME = "_Audit library host with settings";
const DOCTYPE_ALIAS = "_auditLibraryHostSettings";

const VARIANT_ELEMENT_TYPE_NAME = "_Audit library variant element";
const VARIANT_ELEMENT_TYPE_ALIAS = "_auditLibraryVariantElement";
const VARIANT_BLOCKLIST_NAME = "_Audit library variant blocklist";
const VARIANT_DOCTYPE_NAME = "_Audit library variant host";
const VARIANT_DOCTYPE_ALIAS = "_auditLibraryVariantHost";
const FALLBACK_SECOND_LANGUAGE = { isoCode: "nb-NO", name: "Norwegian Bokmål" };

export const LIBRARY_PROPERTY_ALIAS = "blocks";
export const LIBRARY_BLOCK_PROPERTY_ALIAS = "title";

export interface LibraryTypes {
  elementTypeId: string;
  docTypeId: string;
}

let cachedTypes: LibraryTypes | null = null;
let cachedVariantTypes: (LibraryTypes & { cultures: [string, string] }) | null = null;

function fail(step: string, result: any): never {
  throw new Error(`${step} failed: ${JSON.stringify(extractChainedResult(result))}`);
}

async function findDataTypeId(name: string): Promise<string | undefined> {
  const found = await mcpClientManager.callTool("cms", "find-data-type", { name });
  if (found.isError) return undefined;
  return ((extractChainedResult(found)?.items ?? []) as Array<{ id: string; name: string }>).find((d) => d.name === name)?.id;
}

// get-all-document-types returns tree items, which carry the name but not the alias.
async function findDocTypeId(alias: string, name: string): Promise<string | undefined> {
  const all = await mcpClientManager.callTool("cms", "get-all-document-types", {});
  return ((extractChainedResult(all)?.items ?? []) as Array<{ id: string; alias?: string; name?: string }>)
    .find((d) => d.alias === alias || d.name === name)?.id;
}

async function ensureTextbox(): Promise<string> {
  let id = await findDataTypeId(TEXTBOX_NAME);
  if (!id) {
    const created = await mcpClientManager.callTool("cms", "create-data-type", {
      name: TEXTBOX_NAME,
      editorAlias: "Umbraco.TextBox",
      editorUiAlias: "Umb.PropertyEditorUi.TextBox",
      values: [{ alias: "maxChars", value: 200 }],
    });
    if (created.isError) fail("create-data-type (textbox)", created);
    id = extractChainedResult(created)?.id;
  }
  return id!;
}

async function ensureElementType(name: string, alias: string, textboxId: string): Promise<string> {
  let id = await findDocTypeId(alias, name);
  if (!id) {
    const created = await mcpClientManager.callTool("cms", "create-element-type", {
      name,
      alias,
      icon: "icon-block",
      compositions: [],
      allowedInLibrary: true,
      properties: [{ name: "Title", alias: LIBRARY_BLOCK_PROPERTY_ALIAS, dataTypeId: textboxId, group: "Content" }],
    });
    if (created.isError) fail("create-element-type", created);
    id = extractChainedResult(created)?.id;
  }
  return id!;
}

async function ensureBlockList(name: string, blockConfig: Record<string, string>): Promise<string> {
  let id = await findDataTypeId(name);
  if (!id) {
    const created = await mcpClientManager.callTool("cms", "create-data-type", {
      name,
      editorAlias: "Umbraco.BlockList",
      editorUiAlias: "Umb.PropertyEditorUi.BlockList",
      values: [{ alias: "blocks", value: [blockConfig] }],
    });
    if (created.isError) fail("create-data-type (blocklist)", created);
    id = extractChainedResult(created)?.id;
  }
  return id!;
}

async function ensureHostDocType(name: string, alias: string, blockListId: string): Promise<string> {
  let id = await findDocTypeId(alias, name);
  if (!id) {
    const created = await mcpClientManager.callTool("cms", "create-document-type", {
      name,
      alias,
      icon: "icon-document",
      allowedAsRoot: true,
      compositions: [],
      allowedDocumentTypes: [],
      properties: [{ name: "Blocks", alias: LIBRARY_PROPERTY_ALIAS, dataTypeId: blockListId, group: "Content" }],
    });
    if (created.isError) fail("create-document-type", created);
    id = extractChainedResult(created)?.id;
  }
  return id!;
}

/**
 * Make a (document or element) type vary by culture. When `propertyAliases`
 * is given, only those properties vary too; the rest stay shared — which is
 * how a culture-variant page keeps one shared BlockList whose blocks vary
 * per culture (block-level variance).
 */
async function makeCultureVariant(id: string, varyingPropertyAliases: string[]): Promise<void> {
  const current = await mcpClientManager.callTool("cms", "get-document-type-by-id", { id });
  if (current.isError) fail("get-document-type-by-id", current);
  const dt = extractChainedResult(current) as any;
  const wanted = (p: any) => varyingPropertyAliases.includes(p.alias);
  if (dt.variesByCulture && (dt.properties ?? []).every((p: any) => p.variesByCulture === wanted(p))) return;
  const { id: _id, ...data } = dt;
  const updated = await mcpClientManager.callTool("cms", "update-document-type", {
    id,
    data: {
      ...data,
      variesByCulture: true,
      properties: (dt.properties ?? []).map((p: any) => ({ ...p, variesByCulture: wanted(p) })),
    },
  });
  if (updated.isError) fail("update-document-type (variesByCulture)", updated);
}

/** Idempotently provision the invariant Library-enabled element type, data type (with settings), and host doc type. */
export async function provisionLibraryTypes(): Promise<LibraryTypes> {
  if (cachedTypes) return cachedTypes;
  const textboxId = await ensureTextbox();
  const elementTypeId = await ensureElementType(ELEMENT_TYPE_NAME, ELEMENT_TYPE_ALIAS, textboxId);
  // The same element type doubles as the settings type: its "title" is the settings value.
  const blockListId = await ensureBlockList(BLOCKLIST_NAME, { contentElementTypeKey: elementTypeId, settingsElementTypeKey: elementTypeId });
  const docTypeId = await ensureHostDocType(DOCTYPE_NAME, DOCTYPE_ALIAS, blockListId);
  cachedTypes = { elementTypeId, docTypeId };
  return cachedTypes;
}

/** The default language plus a second one (an existing one, else nb-NO is added and left in place). */
async function ensureTwoCultures(): Promise<[string, string]> {
  const list = async () => {
    const result = await mcpClientManager.callTool("cms", "get-language", {});
    if (result.isError) fail("get-language", result);
    return (extractChainedResult(result)?.items ?? []) as Array<{ isoCode: string; isDefault: boolean }>;
  };
  let languages = await list();
  if (!languages.some((l) => !l.isDefault)) {
    const created = await mcpClientManager.callTool("cms", "create-language", {
      ...FALLBACK_SECOND_LANGUAGE, isDefault: false, isMandatory: false,
    });
    if (created.isError) fail("create-language", created);
    languages = await list();
  }
  const def = languages.find((l) => l.isDefault)!.isoCode;
  const second = languages.find((l) => !l.isDefault)!.isoCode;
  return [def, second];
}

/** Idempotently provision the culture-variant Library element type, data type, and culture-variant host doc type. */
export async function provisionVariantLibraryTypes(): Promise<LibraryTypes & { cultures: [string, string] }> {
  if (cachedVariantTypes) return cachedVariantTypes;
  const cultures = await ensureTwoCultures();
  const textboxId = await ensureTextbox();
  const elementTypeId = await ensureElementType(VARIANT_ELEMENT_TYPE_NAME, VARIANT_ELEMENT_TYPE_ALIAS, textboxId);
  await makeCultureVariant(elementTypeId, [LIBRARY_BLOCK_PROPERTY_ALIAS]);
  const blockListId = await ensureBlockList(VARIANT_BLOCKLIST_NAME, { contentElementTypeKey: elementTypeId });
  const docTypeId = await ensureHostDocType(VARIANT_DOCTYPE_NAME, VARIANT_DOCTYPE_ALIAS, blockListId);
  // The page varies by culture but its BlockList stays shared, so the block's
  // own values carry the per-culture content.
  await makeCultureVariant(docTypeId, []);
  cachedVariantTypes = { elementTypeId, docTypeId, cultures };
  return cachedVariantTypes;
}

export interface LibraryBlockFixture extends LibraryTypes {
  pageId: string;
  /** contentKey of the seeded local block */
  blockKey: string;
  blockValue: string;
  /** settingsKey of the seeded block's settings entry */
  settingsKey: string;
  settingsValue: string;
  /** Track any Library Element a test creates so cleanup removes it. */
  trackElement(id: string): void;
  cleanup(): Promise<void>;
}

function trackingCleanup(pageId: string) {
  const elements: string[] = [];
  return {
    trackElement: (id: string) => { elements.push(id); },
    cleanup: async () => {
      await ContentTestHelper.cleanupById(pageId);
      // Delete permanently: a trashed Element keeps its culture variations,
      // which blocks deleting their language (FK on umbracoElementCultureVariation).
      for (const id of elements) {
        const deleted = await mcpClientManager.callTool("cms", "delete-element", { id }).catch(() => ({ isError: true }));
        if ((deleted as { isError?: boolean }).isError) {
          await mcpClientManager.callTool("cms", "delete-element-from-recycle-bin", { id }).catch(() => undefined);
        }
      }
    },
  };
}

/** Create a root page holding one exposed local block (content + settings) of the Library-enabled type. */
export async function createLibraryBlockFixture(name: string): Promise<LibraryBlockFixture> {
  const types = await provisionLibraryTypes();
  const blockKey = randomUUID();
  const settingsKey = randomUUID();
  const blockValue = `Shared promo ${blockKey.slice(0, 8)}`;
  const settingsValue = `Local settings ${settingsKey.slice(0, 8)}`;

  const page = await new ContentBuilder()
    .withName(name)
    .withDocumentType(types.docTypeId)
    .withValue(LIBRARY_PROPERTY_ALIAS, {
      contentData: [{
        key: blockKey,
        contentTypeKey: types.elementTypeId,
        values: [{ alias: LIBRARY_BLOCK_PROPERTY_ALIAS, value: blockValue, culture: null, segment: null }],
      }],
      settingsData: [{
        key: settingsKey,
        contentTypeKey: types.elementTypeId,
        values: [{ alias: LIBRARY_BLOCK_PROPERTY_ALIAS, value: settingsValue, culture: null, segment: null }],
      }],
      layout: { "Umbraco.BlockList": [{ contentKey: blockKey, settingsKey }] },
      expose: [{ contentKey: blockKey, culture: null, segment: null }],
    })
    .create();

  return {
    ...types,
    pageId: page.getId(),
    blockKey,
    blockValue,
    settingsKey,
    settingsValue,
    ...trackingCleanup(page.getId()),
  };
}

export interface MultilingualLibraryBlockFixture extends LibraryTypes {
  pageId: string;
  blockKey: string;
  /** [default culture, second culture] */
  cultures: [string, string];
  /** The block's title per culture */
  values: Record<string, string>;
  trackElement(id: string): void;
  cleanup(): Promise<void>;
}

/**
 * Create a page in two languages holding one block of the culture-variant
 * Library type, with a title in each culture. `exposeIn` controls which
 * cultures the block is shown in (default: both).
 */
export async function createMultilingualLibraryBlockFixture(
  name: string,
  options: { exposeIn?: "both" | "default" } = {},
): Promise<MultilingualLibraryBlockFixture> {
  const types = await provisionVariantLibraryTypes();
  const [def, second] = types.cultures;
  const blockKey = randomUUID();
  const values = { [def]: `Promo ${def} ${blockKey.slice(0, 8)}`, [second]: `Promo ${second} ${blockKey.slice(0, 8)}` };
  const exposeCultures = options.exposeIn === "default" ? [def] : [def, second];

  const created = await mcpClientManager.callTool("cms", "create-document", {
    documentTypeId: types.docTypeId,
    name,
    cultures: [def, second],
    values: [{
      alias: LIBRARY_PROPERTY_ALIAS,
      editorAlias: "Umbraco.BlockList",
      culture: null,
      segment: null,
      value: {
        contentData: [{
          key: blockKey,
          contentTypeKey: types.elementTypeId,
          values: [def, second].map((c) => ({ alias: LIBRARY_BLOCK_PROPERTY_ALIAS, value: values[c], culture: c, segment: null })),
        }],
        settingsData: [],
        layout: { "Umbraco.BlockList": [{ contentKey: blockKey }] },
        expose: exposeCultures.map((c) => ({ contentKey: blockKey, culture: c, segment: null })),
      },
    }],
  });
  if (created.isError) fail("create-document (multilingual)", created);
  const pageId: string = extractChainedResult(created)?.id ?? (await ContentTestHelper.findDocument(name))?.id;
  if (!pageId) throw new Error(`Could not find created multilingual page "${name}"`);

  return {
    elementTypeId: types.elementTypeId,
    docTypeId: types.docTypeId,
    pageId,
    blockKey,
    cultures: [def, second],
    values,
    ...trackingCleanup(pageId),
  };
}

/** Create and publish a standalone Library Element of the invariant Library-enabled type. */
export async function createLibraryElement(name: string, title: string): Promise<string> {
  const types = await provisionLibraryTypes();
  const created = await mcpClientManager.callTool("cms", "create-and-publish-element", {
    documentTypeId: types.elementTypeId,
    name,
    values: [{ alias: LIBRARY_BLOCK_PROPERTY_ALIAS, value: title, culture: null, segment: null }],
  });
  if (created.isError) fail("create-and-publish-element", created);
  const id = extractChainedResult(created)?.id;
  if (!id) throw new Error("create-and-publish-element returned no id");
  return id;
}

/**
 * Create a culture-variant Library Element in both fixture languages, published
 * only in the cultures given (to test per-culture publish warnings).
 */
export async function createVariantLibraryElement(name: string, publishIn: string[]): Promise<{ id: string; cultures: [string, string] }> {
  const types = await provisionVariantLibraryTypes();
  const [def, second] = types.cultures;
  const created = await mcpClientManager.callTool("cms", "create-and-publish-element", {
    documentTypeId: types.elementTypeId,
    name,
    cultures: [def, second],
    culturesToPublish: publishIn,
    values: [def, second].map((c) => ({ alias: LIBRARY_BLOCK_PROPERTY_ALIAS, value: `${name} ${c}`, culture: c, segment: null })),
  });
  if (created.isError) fail("create-and-publish-element (variant)", created);
  const id = extractChainedResult(created)?.id;
  if (!id) throw new Error("create-and-publish-element returned no id");
  return { id, cultures: [def, second] };
}
