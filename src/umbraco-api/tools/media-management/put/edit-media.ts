import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the media item to edit"),
  name: z.string().optional().describe("Optional new display name for the media item"),
  values: z.array(z.object({
    alias: z.string().describe("The property alias (e.g. 'altText' for image alt text on the default Image media type)"),
    value: z.any().describe("The new property value"),
    culture: z.string().nullable().optional(),
    segment: z.string().nullable().optional(),
  })).optional().describe("Optional property values to update. Existing properties not in this array are preserved."),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  updatedFields: z.array(z.string()),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "edit-media",
  description: "Update properties on a media item — commonly used to set alt text (e.g. 'altText' on the default Image media type) or rename an item. Call get-media-type first to discover valid property aliases. Does not move the item (use move-media instead).",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, name, values }) => {
    if (!name && (!values || values.length === 0)) {
      return createToolResultError({ detail: "Provide at least one of `name` or `values` to update." });
    }

    const mediaResult = await chainCms("get-media-by-id", { id });
    if (!mediaResult.ok) return mediaResult.errorResult;
    const currentName: string = mediaResult.data.variants?.[0]?.name ?? "Unknown";

    const mergedValues = new Map<string, any>();
    for (const v of mediaResult.data.values) {
      mergedValues.set(`${v.alias}|${v.culture ?? ""}|${v.segment ?? ""}`, v);
    }
    for (const v of values ?? []) {
      mergedValues.set(`${v.alias}|${v.culture ?? ""}|${v.segment ?? ""}`, {
        alias: v.alias,
        value: v.value,
        culture: v.culture ?? null,
        segment: v.segment ?? null,
      });
    }

    const mergedVariants = name
      ? mediaResult.data.variants.map((v, i) => i === 0 ? { ...v, name } : v)
      : mediaResult.data.variants;

    const updateResult = await chainCms("update-media", {
      id,
      data: { values: Array.from(mergedValues.values()), variants: mergedVariants },
    });
    if (!updateResult.ok) return updateResult.errorResult;

    const updatedFields: string[] = [
      ...(name && name !== currentName ? ["name"] : []),
      ...(values ?? []).map(v => v.alias),
    ];
    const finalName = name ?? currentName;
    return createToolResult({
      message: `Updated ${updatedFields.length} field(s) on "${finalName}"`,
      id,
      name: finalName,
      updatedFields,
    });
  },
};

export default withStandardDecorators(tool);
