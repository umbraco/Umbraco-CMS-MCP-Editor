import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import {
  buildBlockEntry,
  exposeEntry,
  insertAtPosition,
  isRteWithBlocks,
  resolveBlockEditorAliases,
} from "../../helpers/block-builder.js";

const positionSchema = z.object({
  mode: z.enum(["append", "prepend", "before", "after"]).describe("Where to place the new block in the rich text markup, relative to existing umb-rte-block tags"),
  anchorContentKey: z.string().uuid().optional().describe("Required for 'before' or 'after' — the contentKey of an existing block in the same rich text"),
}).optional();

const valueSchema = z.object({
  alias: z.string().describe("The block property alias"),
  value: z.any().describe("The value for the block property"),
});

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page containing the rich text property"),
  propertyAlias: z.string().describe("The document property alias holding the rich text (e.g. 'bodyText'). Use inspect-blocks first to find this."),
  contentTypeKey: z.string().uuid().describe("The element type ID for the new block's content. Use inspect-blocks on a page that already has this kind of block to find it."),
  values: z.array(valueSchema).min(1).describe("Initial values for the new block's content properties (at least one required)"),
  position: positionSchema.describe("Where to insert the new block tag in the markup. Defaults to 'append' (after the last block, or at the end of the markup)."),
  settingsTypeKey: z.string().uuid().optional().describe("Optional element type ID for the new block's settings"),
  settingsValues: z.array(valueSchema).optional().describe("Required when settingsTypeKey is supplied — the initial settings property values"),
  culture: z.string().nullable().optional().describe("Culture code if the document property is variant"),
  segment: z.string().nullable().optional().describe("Segment if the document property is variant"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  contentKey: z.string(),
});

function buildBlockTag(contentKey: string): string {
  return `<umb-rte-block data-content-key="${contentKey}"></umb-rte-block>`;
}

function findAnchorTagRange(markup: string, anchorKey: string): { start: number; end: number } | null {
  const re = new RegExp(`<umb-rte-block[^>]*data-content-key="${anchorKey}"[^>]*>\\s*</umb-rte-block>`, "i");
  const match = markup.match(re);
  if (!match || match.index === undefined) return null;
  return { start: match.index, end: match.index + match[0].length };
}

function insertMarkup(markup: string, newTag: string, mode: "append" | "prepend" | "before" | "after", anchorKey?: string): { ok: true; markup: string } | { ok: false; reason: string } {
  if (mode === "append") return { ok: true, markup: `${markup}${newTag}` };
  if (mode === "prepend") return { ok: true, markup: `${newTag}${markup}` };
  if (!anchorKey) return { ok: false, reason: "missing anchor" };
  const range = findAnchorTagRange(markup, anchorKey);
  if (!range) return { ok: false, reason: "anchor not found" };
  if (mode === "before") {
    return { ok: true, markup: `${markup.slice(0, range.start)}${newTag}${markup.slice(range.start)}` };
  }
  return { ok: true, markup: `${markup.slice(0, range.end)}${newTag}${markup.slice(range.end)}` };
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "add-rte-block",
  description: "Add a new block inside a Rich Text property on a page. Inserts the umb-rte-block tag in the markup at the chosen position and adds the matching content/settings entries. Use inspect-blocks first to find the propertyAlias and a sample contentTypeKey. For non-string property values inside the block (media pickers, content pickers, image cropper, slider, color, date, etc.) call get-property-value-template with the editor alias first to see the expected JSON shape. For BlockList use add-blocklist-block; for BlockGrid use add-blockgrid-block. Changes are saved as a draft, NOT published.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ id, propertyAlias, contentTypeKey, values, position, settingsTypeKey, settingsValues, culture, segment }) => {
    if (settingsTypeKey && (!settingsValues || settingsValues.length === 0)) {
      return createToolResultError({ content: [{ type: "text", text: "settingsValues is required when settingsTypeKey is provided." }], isError: true });
    }
    if (!settingsTypeKey && settingsValues && settingsValues.length > 0) {
      return createToolResultError({ content: [{ type: "text", text: "settingsTypeKey is required when settingsValues is provided." }], isError: true });
    }
    const resolvedPosition = position ?? { mode: "append" as const };
    if ((resolvedPosition.mode === "before" || resolvedPosition.mode === "after") && !resolvedPosition.anchorContentKey) {
      return createToolResultError({ content: [{ type: "text", text: `position.anchorContentKey is required when mode is '${resolvedPosition.mode}'.` }], isError: true });
    }

    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const doc = docResult.data;
    const pageName = doc.variants?.[0]?.name ?? "Unknown";

    // Look up the existing value for the property (may be absent when the property
    // has never been populated — e.g. a newly-created page).  An absent value is
    // NOT an error: we simply start with an empty RTE container.
    const existingProp = (doc.values ?? []).find(
      (v) => v.alias === propertyAlias && (v.culture ?? null) === (culture ?? null) && (v.segment ?? null) === (segment ?? null),
    );
    const propValue: any = existingProp?.value ?? {
      markup: "",
      blocks: { layout: {}, contentData: [], settingsData: [], expose: [] },
    };

    if (existingProp && !isRteWithBlocks(propValue)) {
      return createToolResultError({ content: [{ type: "text", text: `Property '${propertyAlias}' on '${pageName}' is not a rich text with blocks. Use inspect-blocks to confirm the editor type, or add-blocklist-block / add-blockgrid-block as appropriate.` }], isError: true });
    }

    const contentEditorAliases = await resolveBlockEditorAliases(contentTypeKey);
    if (!contentEditorAliases.ok) return contentEditorAliases.errorResult;

    let settingsEditorAliases: Map<string, string> | null = null;
    if (settingsTypeKey) {
      const settingsResult = await resolveBlockEditorAliases(settingsTypeKey);
      if (!settingsResult.ok) return settingsResult.errorResult;
      settingsEditorAliases = settingsResult.editorAliasByAlias;
    }

    const newContentKey = randomUUID();
    const newSettingsKey = settingsTypeKey ? randomUUID() : undefined;
    const cultureValue = culture ?? null;
    const segmentValue = segment ?? null;

    const newContentEntry = buildBlockEntry(newContentKey, contentTypeKey, values, contentEditorAliases.editorAliasByAlias, cultureValue, segmentValue);
    const newSettingsEntry = settingsTypeKey && newSettingsKey && settingsValues
      ? buildBlockEntry(newSettingsKey, settingsTypeKey, settingsValues, settingsEditorAliases ?? new Map(), cultureValue, segmentValue)
      : null;

    const blocks = propValue.blocks as { layout?: Record<string, Array<{ contentKey: string; settingsKey?: string }>>; contentData?: any[]; settingsData?: any[]; expose?: any[] };
    const layoutKey = "Umbraco.RichText";
    const existingLayout: Array<{ contentKey: string; settingsKey?: string }> = Array.isArray(blocks.layout?.[layoutKey]) ? blocks.layout![layoutKey]! : [];
    const layoutEntry: { contentKey: string; settingsKey?: string } = newSettingsKey
      ? { contentKey: newContentKey, settingsKey: newSettingsKey }
      : { contentKey: newContentKey };

    const insertLayoutResult = insertAtPosition(existingLayout, layoutEntry, resolvedPosition, entry => entry.contentKey === resolvedPosition.anchorContentKey);
    if (!insertLayoutResult.ok) {
      return createToolResultError({ content: [{ type: "text", text: `Anchor block '${resolvedPosition.anchorContentKey}' was not found in '${propertyAlias}'.` }], isError: true });
    }

    const markupResult = insertMarkup(propValue.markup ?? "", buildBlockTag(newContentKey), resolvedPosition.mode, resolvedPosition.anchorContentKey);
    if (!markupResult.ok) {
      return createToolResultError({ content: [{ type: "text", text: `Could not insert into markup — ${markupResult.reason}.` }], isError: true });
    }

    const newValue = {
      ...propValue,
      markup: markupResult.markup,
      blocks: {
        ...blocks,
        layout: { ...(blocks.layout ?? {}), [layoutKey]: insertLayoutResult.list },
        contentData: [...(blocks.contentData ?? []), newContentEntry],
        settingsData: newSettingsEntry
          ? [...(blocks.settingsData ?? []), newSettingsEntry]
          : (blocks.settingsData ?? []),
        expose: [...(blocks.expose ?? []), exposeEntry(newContentKey, cultureValue, segmentValue)],
      },
    };

    const updateResult = await chainCms("update-document-properties", {
      id,
      properties: [{
        alias: propertyAlias,
        value: newValue,
        culture: cultureValue,
        segment: segmentValue,
      }],
    });
    if (!updateResult.ok) return updateResult.errorResult;

    return createToolResult({
      message: `Added a new block to "${pageName}" rich text (saved, not published)`,
      id,
      name: pageName,
      contentKey: newContentKey,
    });
  },
};

export default withStandardDecorators(tool);
