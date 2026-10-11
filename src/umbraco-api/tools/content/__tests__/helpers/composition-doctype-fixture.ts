/**
 * Composition Doctype Fixture
 *
 * Provisions a "composition" document type (standing in for something like a
 * shared SEO fieldset) and a second "host" document type that pulls it in via
 * `compositions`. The host's OWN `properties` array never includes the
 * composition's property — it's only reachable by walking the host's
 * compositions, which is exactly the gap create-page / create-and-publish-page
 * need to close (see resolve-document-type-properties.ts).
 *
 * Idempotent and never cleaned up — mirrors the provisioned BlockGrid/RTE
 * donor doc types in block-fixture.ts: found-by-alias and reused across runs
 * rather than torn down, so repeated local/CI runs don't keep recreating it.
 */

import { mcpClientManager } from "../../../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

const TEXTBOX_NAME = "_Test Composition Textbox";
const COMPOSITION_ALIAS = "_testSeoComposition";
const COMPOSITION_NAME = "_Test Seo Composition";
const COMPOSITION_PROPERTY_ALIAS = "compositionSeoTitle";
const HOST_ALIAS = "_testCompositionHost";
const HOST_NAME = "_Test Composition Host";
const HOST_PROPERTY_ALIAS = "compositionHostTitle";

export interface CompositionDoctypeFixtureResult {
  /** Pass as documentTypeId to create-page / create-and-publish-page. Has no own property for the SEO field — only the composition does. */
  hostDocumentTypeId: string;
  /** Property alias defined on the composition doc type, inherited by the host. */
  compositionPropertyAlias: string;
  /** Property alias defined directly on the host doc type, for a control value alongside the inherited one. */
  hostPropertyAlias: string;
}

async function findDataTypeIdByName(name: string): Promise<string | undefined> {
  const found = await mcpClientManager.callTool("cms", "find-data-type", { name });
  if (found.isError) return undefined;
  const items = (extractChainedResult(found)?.items ?? []) as Array<{ id: string; name: string }>;
  return items.find((d) => d.name === name)?.id;
}

/**
 * get-all-document-types only returns the doc-type tree's root-level folders
 * ("Compositions" / "Elements" / "Pages"), and tree items don't reliably carry
 * their alias in `flags` — list-document-types.ts hits the same gap and works
 * around it by resolving each node via get-document-type-by-id. Since our
 * fixture names are unique test-only strings, search by name instead (exact
 * match) and resolve the id straight from the search result.
 */
async function findDocumentTypeIdByName(name: string): Promise<string | undefined> {
  const found = await mcpClientManager.callTool("cms", "get-document-type-tree-search", { query: name });
  if (found.isError) return undefined;
  const items = (extractChainedResult(found)?.items ?? []) as Array<{ id: string; name: string }>;
  return items.find((d) => d.name === name)?.id;
}

let cached: CompositionDoctypeFixtureResult | null = null;

/** Idempotently provisions the composition + host doc types and returns their ids/aliases. */
export async function getOrCreateCompositionDoctypeFixture(): Promise<CompositionDoctypeFixtureResult> {
  if (cached) return cached;

  // 1 — TextBox data type, shared by both properties
  let textboxId = await findDataTypeIdByName(TEXTBOX_NAME);
  if (!textboxId) {
    const created = await mcpClientManager.callTool("cms", "create-data-type", {
      name: TEXTBOX_NAME,
      editorAlias: "Umbraco.TextBox",
      editorUiAlias: "Umb.PropertyEditorUi.TextBox",
      values: [{ alias: "maxChars", value: 200 }],
    });
    if (created.isError) {
      throw new Error(
        `CompositionDoctypeFixture: create-data-type failed: ${JSON.stringify(extractChainedResult(created))}`,
      );
    }
    textboxId = extractChainedResult(created)?.id;
  }
  if (!textboxId) throw new Error("CompositionDoctypeFixture: could not resolve textbox data type id");

  // 2 — Composition doc type with its own property
  let compositionId = await findDocumentTypeIdByName(COMPOSITION_NAME);
  if (!compositionId) {
    const created = await mcpClientManager.callTool("cms", "create-document-type", {
      name: COMPOSITION_NAME,
      alias: COMPOSITION_ALIAS,
      icon: "icon-document",
      allowedAsRoot: false,
      compositions: [],
      allowedDocumentTypes: [],
      properties: [
        { name: "Composition Seo Title", alias: COMPOSITION_PROPERTY_ALIAS, dataTypeId: textboxId, group: "Seo" },
      ],
    });
    if (created.isError) {
      throw new Error(
        `CompositionDoctypeFixture: create-document-type (composition) failed: ${JSON.stringify(extractChainedResult(created))}`,
      );
    }
    compositionId = extractChainedResult(created)?.id;
  }
  if (!compositionId) throw new Error("CompositionDoctypeFixture: could not resolve composition doc type id");

  // 3 — Host doc type that uses the composition, plus one property of its own
  let hostId = await findDocumentTypeIdByName(HOST_NAME);
  if (!hostId) {
    const created = await mcpClientManager.callTool("cms", "create-document-type", {
      name: HOST_NAME,
      alias: HOST_ALIAS,
      icon: "icon-document",
      allowedAsRoot: true,
      compositions: [compositionId],
      allowedDocumentTypes: [],
      properties: [
        { name: "Composition Host Title", alias: HOST_PROPERTY_ALIAS, dataTypeId: textboxId, group: "Content" },
      ],
    });
    if (created.isError) {
      throw new Error(
        `CompositionDoctypeFixture: create-document-type (host) failed: ${JSON.stringify(extractChainedResult(created))}`,
      );
    }
    hostId = extractChainedResult(created)?.id;
  }
  if (!hostId) throw new Error("CompositionDoctypeFixture: could not resolve host doc type id");

  cached = {
    hostDocumentTypeId: hostId,
    compositionPropertyAlias: COMPOSITION_PROPERTY_ALIAS,
    hostPropertyAlias: HOST_PROPERTY_ALIAS,
  };
  return cached;
}
