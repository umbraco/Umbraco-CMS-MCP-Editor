import { chainCms } from "../../cms-chain.js";
import { createToolResult, createToolResultError } from "@umbraco-cms/mcp-server-sdk";
import { fetchPreviewUrl } from "./preview-url.js";
import { validateDocumentState } from "./validate-document.js";

export type BlockValue = { alias: string; value: unknown };

export type Position = {
  mode: "append" | "prepend" | "before" | "after";
  anchorContentKey?: string;
};

type BlockProperty ={ alias: string; value: unknown; culture: string | null; segment: string | null };

type BlockPropertiesResult =
  | { ok: true; properties: BlockProperty[] }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

/**
 * Maps editor-supplied block values onto create-document-block's property shape.
 * The document's culture/segment is only stamped on element properties that vary
 * by it — create-document-block rejects a culture on an invariant property.
 */
async function toBlockProperties(
  elementTypeKey: string,
  values: ReadonlyArray<BlockValue>,
  culture: string | null,
  segment: string | null,
): Promise<BlockPropertiesResult> {
  if (values.length === 0) return { ok: true, properties: [] };
  const docTypeResult = await chainCms("get-document-type-by-id", { id: elementTypeKey });
  if (!docTypeResult.ok) return { ok: false, errorResult: docTypeResult.errorResult };
  const definitions = new Map(docTypeResult.data.properties.map(p => [p.alias, p]));
  return {
    ok: true,
    properties: values.map(v => {
      const def = definitions.get(v.alias);
      return {
        alias: v.alias,
        value: v.value,
        culture: def?.variesByCulture ? culture : null,
        segment: def?.variesBySegment ? segment : null,
      };
    }),
  };
}

type NewBlockPropertiesResult =
  | { ok: true; properties: BlockProperty[]; settings?: { properties: BlockProperty[] } }
  | { ok: false; errorResult: ReturnType<typeof createToolResultError> };

/**
 * Builds create-document-block's `properties` and `settings` from the editor
 * tools' values/settingsValues. The settings element type itself comes from the
 * data type configuration on the CMS side; settingsTypeKey is only used to
 * resolve which settings properties vary by culture/segment.
 */
export async function toNewBlockProperties(
  contentTypeKey: string,
  values: ReadonlyArray<BlockValue>,
  settingsTypeKey: string | undefined,
  settingsValues: ReadonlyArray<BlockValue> | undefined,
  culture: string | null,
  segment: string | null,
): Promise<NewBlockPropertiesResult> {
  const content = await toBlockProperties(contentTypeKey, values, culture, segment);
  if (!content.ok) return content;
  if (!settingsTypeKey || !settingsValues) return { ok: true, properties: content.properties };
  const settings = await toBlockProperties(settingsTypeKey, settingsValues, culture, segment);
  if (!settings.ok) return settings;
  return { ok: true, properties: content.properties, settings: { properties: settings.properties } };
}

export function toPlacement(position: Position): { position: Position["mode"]; contentKey?: string } {
  return position.mode === "before" || position.mode === "after"
    ? { position: position.mode, contentKey: position.anchorContentKey }
    : { position: position.mode };
}

/**
 * Shared response for the block write tools once the chained CMS write has
 * succeeded: re-validates the document and attaches the preview URL.
 */
export async function buildBlockWriteResult(id: string, pageName: string, contentKey: string, baseMessage: string) {
  const validation = await validateDocumentState(id);
  const message = validation.valid
    ? baseMessage
    : `${baseMessage} — but ${validation.errors.length} validation error(s) must be resolved before this page can be published`;

  return createToolResult({
    message,
    id,
    name: pageName,
    contentKey,
    previewUrl: await fetchPreviewUrl(id),
    validation,
  });
}

export function isBlockListOrGridValue(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.contentData)
  );
}

export function isRteWithBlocks(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.markup === "string" &&
    value.blocks !== null &&
    typeof value.blocks === "object" &&
    Array.isArray(value.blocks?.contentData)
  );
}
