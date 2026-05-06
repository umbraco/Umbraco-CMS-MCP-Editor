import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { confirmStep } from "../../helpers/confirm-step.js";
import {
  buildBlockEntry,
  exposeEntry,
  insertAtPosition,
  isBlockListOrGridValue,
  resolveBlockEditorAliases,
} from "../../helpers/block-builder.js";

const positionSchema = z.object({
  mode: z.enum(["append", "prepend", "before", "after"]).describe("Where to place the new block within its scope (top-level row or named area)"),
  anchorContentKey: z.string().uuid().optional().describe("Required for 'before' or 'after' — the contentKey of the anchor block in the same scope"),
}).optional();

const valueSchema = z.object({
  alias: z.string().describe("The block property alias"),
  value: z.any().describe("The value for the block property"),
});

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page containing the BlockGrid property"),
  propertyAlias: z.string().describe("The document property alias holding the BlockGrid (e.g. 'pageContent'). Use inspect-blocks first to find this."),
  contentTypeKey: z.string().uuid().describe("The element type ID for the new block's content. Use inspect-blocks on a page that already has this kind of block to find it."),
  values: z.array(valueSchema).min(1).describe("Initial values for the new block's content properties (at least one required)"),
  position: positionSchema.describe("Where to insert the new block within its scope. Defaults to 'append'."),
  columnSpan: z.number().int().min(1).max(12).optional().describe("Grid column span (1-12). Defaults to 12."),
  rowSpan: z.number().int().min(1).optional().describe("Grid row span. Defaults to 1."),
  areaKey: z.string().uuid().optional().describe("Optional area key. If supplied, the new block is inserted as a nested item inside that area; otherwise it goes into the top-level row layout."),
  parentContentKey: z.string().uuid().optional().describe("Required when areaKey is supplied — the contentKey of the block whose area you are inserting into."),
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

type GridLayoutItem = {
  contentKey: string;
  settingsKey?: string;
  columnSpan?: number;
  rowSpan?: number;
  areas?: Array<{ key: string; items: GridLayoutItem[] }>;
};

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "add-blockgrid-block",
  description: "Add a new block to a BlockGrid property on a page. Supports rowSpan/columnSpan and inserting into a named area on a parent block. Use inspect-blocks first to find the propertyAlias and a sample contentTypeKey. For non-string property values inside the block (media pickers, content pickers, image cropper, slider, color, date, etc.) call get-property-value-template with the editor alias first to see the expected JSON shape. For BlockList use add-blocklist-block; for blocks inside a Rich Text property use add-rte-block. Changes are saved as a draft, NOT published. You will be asked to confirm before adding.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ id, propertyAlias, contentTypeKey, values, position, columnSpan, rowSpan, areaKey, parentContentKey, settingsTypeKey, settingsValues, culture, segment }, extra) => {
    if (settingsTypeKey && (!settingsValues || settingsValues.length === 0)) {
      return createToolResultError({ content: [{ type: "text", text: "settingsValues is required when settingsTypeKey is provided." }], isError: true });
    }
    if (!settingsTypeKey && settingsValues && settingsValues.length > 0) {
      return createToolResultError({ content: [{ type: "text", text: "settingsTypeKey is required when settingsValues is provided." }], isError: true });
    }
    if (areaKey && !parentContentKey) {
      return createToolResultError({ content: [{ type: "text", text: "parentContentKey is required when areaKey is provided — pick the block whose area you want to insert into." }], isError: true });
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
    // NOT an error: we simply start with an empty BlockGrid container.
    const existingProp = (doc.values ?? []).find(
      (v) => v.alias === propertyAlias && (v.culture ?? null) === (culture ?? null) && (v.segment ?? null) === (segment ?? null),
    );
    const propValue: any = existingProp?.value ?? {
      layout: { "Umbraco.BlockGrid": [] },
      contentData: [],
      settingsData: [],
      expose: [],
    };

    if (existingProp && (!isBlockListOrGridValue(propValue) || existingProp.editorAlias !== "Umbraco.BlockGrid")) {
      return createToolResultError({ content: [{ type: "text", text: `Property '${propertyAlias}' on '${pageName}' is not a BlockGrid. Use inspect-blocks to confirm the editor type, or add-blocklist-block / add-rte-block as appropriate.` }], isError: true });
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

    const layoutKey = "Umbraco.BlockGrid";
    const layoutEntry: GridLayoutItem = {
      contentKey: newContentKey,
      ...(newSettingsKey ? { settingsKey: newSettingsKey } : {}),
      columnSpan: columnSpan ?? 12,
      rowSpan: rowSpan ?? 1,
      // Top-level grid blocks include an areas array that mirrors the element
      // type's area configuration. We don't know the configured areas without
      // a doc-type lookup, so default to an empty array — Umbraco will fill in
      // the configured areas on first edit in the backoffice.
      ...(areaKey ? {} : { areas: [] }),
    };

    const topLayout: GridLayoutItem[] = Array.isArray(propValue.layout?.[layoutKey]) ? propValue.layout[layoutKey] : [];
    let nextTopLayout: GridLayoutItem[];

    if (areaKey) {
      const parentIndex = topLayout.findIndex(item => item.contentKey === parentContentKey);
      if (parentIndex === -1) {
        return createToolResultError({ content: [{ type: "text", text: `Parent block '${parentContentKey}' was not found in '${propertyAlias}'.` }], isError: true });
      }
      const parent = topLayout[parentIndex];
      const areas = Array.isArray(parent.areas) ? parent.areas : [];
      const areaIndex = areas.findIndex(area => area.key === areaKey);
      if (areaIndex === -1) {
        return createToolResultError({ content: [{ type: "text", text: `Area '${areaKey}' was not found on parent block '${parentContentKey}'.` }], isError: true });
      }
      const area = areas[areaIndex];
      const insertResult = insertAtPosition(area.items ?? [], layoutEntry, resolvedPosition, item => item.contentKey === resolvedPosition.anchorContentKey);
      if (!insertResult.ok) {
        return createToolResultError({ content: [{ type: "text", text: `Anchor block '${resolvedPosition.anchorContentKey}' was not found in area '${areaKey}'.` }], isError: true });
      }
      const updatedArea = { ...area, items: insertResult.list };
      const updatedAreas = areas.slice();
      updatedAreas[areaIndex] = updatedArea;
      const updatedParent = { ...parent, areas: updatedAreas };
      nextTopLayout = topLayout.slice();
      nextTopLayout[parentIndex] = updatedParent;
    } else {
      const insertResult = insertAtPosition(topLayout, layoutEntry, resolvedPosition, item => item.contentKey === resolvedPosition.anchorContentKey);
      if (!insertResult.ok) {
        return createToolResultError({ content: [{ type: "text", text: `Anchor block '${resolvedPosition.anchorContentKey}' was not found in '${propertyAlias}'.` }], isError: true });
      }
      nextTopLayout = insertResult.list;
    }

    const newValue = {
      ...propValue,
      layout: { ...(propValue.layout ?? {}), [layoutKey]: nextTopLayout },
      contentData: [...(propValue.contentData ?? []), newContentEntry],
      settingsData: newSettingsEntry
        ? [...(propValue.settingsData ?? []), newSettingsEntry]
        : (propValue.settingsData ?? []),
      expose: [...(propValue.expose ?? []), exposeEntry(newContentKey, cultureValue, segmentValue)],
    };

    const scopeLabel = areaKey ? `area ${areaKey} of block ${parentContentKey}` : propertyAlias;
    const positionLabel = resolvedPosition.mode === "append" ? "at the end" : resolvedPosition.mode === "prepend" ? "at the start" : `${resolvedPosition.mode} block ${resolvedPosition.anchorContentKey}`;
    const confirmMessage = `Add a new block to "${pageName}" (${positionLabel} of ${scopeLabel}). Will be saved as a draft, not published.`;
    if (!await confirmStep(extra, confirmMessage)) {
      return createToolResultError({ content: [{ type: "text", text: "Cancelled by user." }], isError: true });
    }

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
