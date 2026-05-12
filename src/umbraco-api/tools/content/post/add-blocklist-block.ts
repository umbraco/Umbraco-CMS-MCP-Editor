import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  withStandardDecorators,
  createToolResult,
  createToolResultError,
  ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import {
  buildBlockEntry,
  exposeEntry,
  insertAtPosition,
  isBlockListOrGridValue,
  resolveBlockEditorAliases,
} from "../../helpers/block-builder.js";

const positionSchema = z.object({
  mode: z.enum(["append", "prepend", "before", "after"]).describe("Where to place the new block relative to existing blocks"),
  anchorContentKey: z.string().uuid().optional().describe("Required for 'before' or 'after' — the contentKey of the anchor block"),
}).optional();

const valueSchema = z.object({
  alias: z.string().describe("The block property alias"),
  value: z.any().describe("The value for the block property"),
});

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page containing the BlockList property"),
  propertyAlias: z.string().describe("The document property alias holding the BlockList (e.g. 'mainContent'). Use inspect-blocks first to find this."),
  contentTypeKey: z.string().uuid().describe("The element type ID for the new block's content. Use inspect-blocks on a page that already has this kind of block to find it."),
  values: z.array(valueSchema).min(1).describe("Initial values for the new block's content properties (at least one required)"),
  position: positionSchema.describe("Where to insert the new block. Defaults to 'append'."),
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

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "add-blocklist-block",
  description: "Add a new block to a BlockList property on a page. Use inspect-blocks first to find the propertyAlias and a sample contentTypeKey. For non-string property values inside the block (media pickers, content pickers, image cropper, slider, color, date, etc.) call get-property-value-template with the editor alias first to see the expected JSON shape. For BlockGrid use add-blockgrid-block; for blocks inside a Rich Text property use add-rte-block. Changes are saved as a draft, NOT published.",
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
    // NOT an error: we simply start with an empty BlockList container.
    const existingProp = (doc.values ?? []).find(
      (v) => v.alias === propertyAlias && (v.culture ?? null) === (culture ?? null) && (v.segment ?? null) === (segment ?? null),
    );
    const propValue: any = existingProp?.value ?? {
      layout: { "Umbraco.BlockList": [] },
      contentData: [],
      settingsData: [],
      expose: [],
    };

    if (existingProp && (!isBlockListOrGridValue(propValue) || existingProp.editorAlias !== "Umbraco.BlockList")) {
      return createToolResultError({ content: [{ type: "text", text: `Property '${propertyAlias}' on '${pageName}' is not a BlockList. Use inspect-blocks to confirm the editor type, or add-rte-block / add-blockgrid-block as appropriate.` }], isError: true });
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

    const layoutKey = "Umbraco.BlockList";
    const layoutEntry: { contentKey: string; settingsKey?: string } = newSettingsKey
      ? { contentKey: newContentKey, settingsKey: newSettingsKey }
      : { contentKey: newContentKey };

    const existingLayout: Array<{ contentKey: string; settingsKey?: string }> = Array.isArray(propValue.layout?.[layoutKey]) ? propValue.layout[layoutKey] : [];
    const insertResult = insertAtPosition(existingLayout, layoutEntry, resolvedPosition, entry => entry.contentKey === resolvedPosition.anchorContentKey);
    if (!insertResult.ok) {
      return createToolResultError({ content: [{ type: "text", text: `Anchor block '${resolvedPosition.anchorContentKey}' was not found in '${propertyAlias}'.` }], isError: true });
    }

    const newValue = {
      ...propValue,
      layout: { ...(propValue.layout ?? {}), [layoutKey]: insertResult.list },
      contentData: [...(propValue.contentData ?? []), newContentEntry],
      settingsData: newSettingsEntry
        ? [...(propValue.settingsData ?? []), newSettingsEntry]
        : (propValue.settingsData ?? []),
      expose: [...(propValue.expose ?? []), exposeEntry(newContentKey, cultureValue, segmentValue)],
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
      message: `Added a new block to "${pageName}" (saved, not published)`,
      id,
      name: pageName,
      contentKey: newContentKey,
    });
  },
};

export default withStandardDecorators(tool);
