import { z } from "zod";
import { withStandardDecorators, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import {
  buildBlockWriteResult,
  isBlockListOrGridValue,
  toNewBlockProperties,
  toPlacement,
} from "../../helpers/block-builder.js";
import { previewUrlSchema } from "../../helpers/preview-url.js";
import { validationResultSchema } from "../../helpers/validate-document.js";

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
  previewUrl: previewUrlSchema,
  validation: validationResultSchema,
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "add-blockgrid-block",
  description: "Add a new block to a BlockGrid property on a page. Supports rowSpan/columnSpan and inserting into a named area on a parent block. Use inspect-blocks first to find the propertyAlias and a sample contentTypeKey. For non-string property values inside the block (media pickers, content pickers, image cropper, slider, color, date, etc.) call get-property-value-template with the editor alias first to see the expected JSON shape. For BlockList use add-blocklist-block; for blocks inside a Rich Text property use add-rte-block. Changes are saved as a draft, NOT published.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ id, propertyAlias, contentTypeKey, values, position, columnSpan, rowSpan, areaKey, parentContentKey, settingsTypeKey, settingsValues, culture, segment }) => {
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

    // The property may have no value yet (e.g. a newly-created page) — that's fine,
    // create-document-block starts an empty container. Only a populated property can
    // be checked for the wrong editor type here.
    const existingProp = (doc.values ?? []).find(
      (v) => v.alias === propertyAlias && (v.culture ?? null) === (culture ?? null) && (v.segment ?? null) === (segment ?? null),
    );

    if (existingProp?.value && (!isBlockListOrGridValue(existingProp.value) || existingProp.editorAlias !== "Umbraco.BlockGrid")) {
      return createToolResultError({ content: [{ type: "text", text: `Property '${propertyAlias}' on '${pageName}' is not a BlockGrid. Use inspect-blocks to confirm the editor type, or add-blocklist-block / add-rte-block as appropriate.` }], isError: true });
    }

    const cultureValue = culture ?? null;
    const segmentValue = segment ?? null;

    const blockProperties = await toNewBlockProperties(contentTypeKey, values, settingsTypeKey, settingsValues, cultureValue, segmentValue);
    if (!blockProperties.ok) return blockProperties.errorResult;

    const createResult = await chainCms("create-document-block", {
      documentId: id,
      propertyAlias,
      culture: cultureValue,
      segment: segmentValue,
      contentTypeKey,
      properties: blockProperties.properties,
      settings: blockProperties.settings,
      placement: toPlacement(resolvedPosition),
      grid: {
        columnSpan: columnSpan ?? 12,
        rowSpan: rowSpan ?? 1,
        ...(areaKey && parentContentKey ? { areaKey, parentContentKey } : {}),
      },
    });
    if (!createResult.ok) return createResult.errorResult;

    return buildBlockWriteResult(id, pageName, createResult.data.results[0].contentKey, `Added a new block to "${pageName}" (saved, not published)`);
  },
};

export default withStandardDecorators(tool);
