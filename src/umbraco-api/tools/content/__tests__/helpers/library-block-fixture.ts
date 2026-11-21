/**
 * Library block fixture — provisions everything the Library block tools need
 * (Umbraco 19 reusable content) on a fresh Umbraco install, then creates a
 * deterministic page to operate on:
 *
 * - an element type with `allowedInLibrary: true` (one TextBox "title"),
 * - a BlockList data type allowing it, and a root-allowed doc type using it,
 * - a page with one exposed local block of that type.
 *
 * The Clean starter kit has no Library-enabled element types, so nothing here
 * can come from a donor page. Provisioning is idempotent (find-then-create);
 * each fixture page and every Element a test creates are cleaned up by ID.
 */

import { randomUUID } from "node:crypto";
import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { ContentBuilder } from "./content-builder.js";
import { ContentTestHelper } from "./content-test-helper.js";

const TEXTBOX_NAME = "_Audit library textbox";
const ELEMENT_TYPE_NAME = "_Audit library element";
const ELEMENT_TYPE_ALIAS = "_auditLibraryElement";
const BLOCKLIST_NAME = "_Audit library blocklist";
const DOCTYPE_NAME = "_Audit library host";
const DOCTYPE_ALIAS = "_auditLibraryHost";
export const LIBRARY_PROPERTY_ALIAS = "blocks";
export const LIBRARY_BLOCK_PROPERTY_ALIAS = "title";

export interface LibraryTypes {
  elementTypeId: string;
  docTypeId: string;
}

let cachedTypes: LibraryTypes | null = null;

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

/** Idempotently provision the Library-enabled element type, data type, and host doc type. */
export async function provisionLibraryTypes(): Promise<LibraryTypes> {
  if (cachedTypes) return cachedTypes;

  let textboxId = await findDataTypeId(TEXTBOX_NAME);
  if (!textboxId) {
    const created = await mcpClientManager.callTool("cms", "create-data-type", {
      name: TEXTBOX_NAME,
      editorAlias: "Umbraco.TextBox",
      editorUiAlias: "Umb.PropertyEditorUi.TextBox",
      values: [{ alias: "maxChars", value: 200 }],
    });
    if (created.isError) throw new Error(`create-data-type failed: ${JSON.stringify(extractChainedResult(created))}`);
    textboxId = extractChainedResult(created)?.id;
  }

  let elementTypeId = await findDocTypeId(ELEMENT_TYPE_ALIAS, ELEMENT_TYPE_NAME);
  if (!elementTypeId) {
    const created = await mcpClientManager.callTool("cms", "create-element-type", {
      name: ELEMENT_TYPE_NAME,
      alias: ELEMENT_TYPE_ALIAS,
      icon: "icon-block",
      compositions: [],
      allowedInLibrary: true,
      properties: [{ name: "Title", alias: LIBRARY_BLOCK_PROPERTY_ALIAS, dataTypeId: textboxId, group: "Content" }],
    });
    if (created.isError) throw new Error(`create-element-type failed: ${JSON.stringify(extractChainedResult(created))}`);
    elementTypeId = extractChainedResult(created)?.id;
  }

  let blockListId = await findDataTypeId(BLOCKLIST_NAME);
  if (!blockListId) {
    const created = await mcpClientManager.callTool("cms", "create-data-type", {
      name: BLOCKLIST_NAME,
      editorAlias: "Umbraco.BlockList",
      editorUiAlias: "Umb.PropertyEditorUi.BlockList",
      values: [{ alias: "blocks", value: [{ contentElementTypeKey: elementTypeId }] }],
    });
    if (created.isError) throw new Error(`create-data-type (blocklist) failed: ${JSON.stringify(extractChainedResult(created))}`);
    blockListId = extractChainedResult(created)?.id;
  }

  let docTypeId = await findDocTypeId(DOCTYPE_ALIAS, DOCTYPE_NAME);
  if (!docTypeId) {
    const created = await mcpClientManager.callTool("cms", "create-document-type", {
      name: DOCTYPE_NAME,
      alias: DOCTYPE_ALIAS,
      icon: "icon-document",
      allowedAsRoot: true,
      compositions: [],
      allowedDocumentTypes: [],
      properties: [{ name: "Blocks", alias: LIBRARY_PROPERTY_ALIAS, dataTypeId: blockListId, group: "Content" }],
    });
    if (created.isError) throw new Error(`create-document-type failed: ${JSON.stringify(extractChainedResult(created))}`);
    docTypeId = extractChainedResult(created)?.id;
  }

  if (!elementTypeId || !docTypeId) throw new Error("Failed to provision Library block types");
  cachedTypes = { elementTypeId, docTypeId };
  return cachedTypes;
}

export interface LibraryBlockFixture extends LibraryTypes {
  pageId: string;
  /** contentKey of the seeded local block */
  blockKey: string;
  blockValue: string;
  /** Track any Library Element a test creates so cleanup removes it. */
  trackElement(id: string): void;
  cleanup(): Promise<void>;
}

/** Create a root page holding one exposed local block of the Library-enabled type. */
export async function createLibraryBlockFixture(name: string): Promise<LibraryBlockFixture> {
  const types = await provisionLibraryTypes();
  const blockKey = randomUUID();
  const blockValue = `Shared promo ${blockKey.slice(0, 8)}`;

  const page = await new ContentBuilder()
    .withName(name)
    .withDocumentType(types.docTypeId)
    .withValue(LIBRARY_PROPERTY_ALIAS, {
      contentData: [{
        key: blockKey,
        contentTypeKey: types.elementTypeId,
        values: [{ alias: LIBRARY_BLOCK_PROPERTY_ALIAS, value: blockValue, culture: null, segment: null }],
      }],
      settingsData: [],
      layout: { "Umbraco.BlockList": [{ contentKey: blockKey }] },
      expose: [{ contentKey: blockKey, culture: null, segment: null }],
    })
    .create();

  const elements: string[] = [];
  return {
    ...types,
    pageId: page.getId(),
    blockKey,
    blockValue,
    trackElement: (id: string) => { elements.push(id); },
    cleanup: async () => {
      await ContentTestHelper.cleanupById(page.getId());
      for (const id of elements) {
        await mcpClientManager.callTool("cms", "move-element-to-recycle-bin", { id }).catch(() => undefined);
      }
    },
  };
}

/** Create and publish a standalone Library Element of the Library-enabled type. */
export async function createLibraryElement(name: string, title: string): Promise<string> {
  const types = await provisionLibraryTypes();
  const created = await mcpClientManager.callTool("cms", "create-and-publish-element", {
    documentTypeId: types.elementTypeId,
    name,
    values: [{ alias: LIBRARY_BLOCK_PROPERTY_ALIAS, value: title }],
  });
  if (created.isError) throw new Error(`create-and-publish-element failed: ${JSON.stringify(extractChainedResult(created))}`);
  const id = extractChainedResult(created)?.id;
  if (!id) throw new Error("create-and-publish-element returned no id");
  return id;
}
