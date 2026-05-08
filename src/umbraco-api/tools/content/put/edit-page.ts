import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { fetchPreviewUrl, previewUrlSchema } from "../../helpers/preview-url.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to edit"),
  values: z.array(z.object({
    alias: z.string().describe("The property alias"),
    value: z.any().describe("The new property value"),
    culture: z.string().nullable().optional().describe("The culture code for variant content"),
    segment: z.string().nullable().optional().describe("The segment for segmented content"),
  })).describe("Property values to update on the page"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  updatedFields: z.array(z.string()),
  previewUrl: previewUrlSchema,
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "edit-page",
  description: "Update specific fields on a content page. Changes are saved but NOT published. Call get-page first to discover valid property aliases. For non-string non-block property values (media pickers, content/multi-node pickers, image cropper, slider, color, date, etc.), call get-property-value-template with the editor alias first to see the expected JSON shape — the LLM-default shape is often wrong for structured editors. For block-shaped values (BlockList / BlockGrid / Rich-Text-with-blocks) use the dedicated tools — inspect-blocks, add-blocklist-block / add-blockgrid-block / add-rte-block, edit-block — instead of hand-constructing the JSON here.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, values }) => {
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const pageName = docResult.data.variants?.[0]?.name ?? "Unknown";
    const fieldNames = values.map((v) => v.alias);

    const properties = values.map(v => ({
      alias: v.alias,
      value: v.value,
      culture: v.culture ?? null,
      segment: v.segment ?? null,
    })) as [(typeof values)[number] & { culture: string | null; segment: string | null }, ...((typeof values)[number] & { culture: string | null; segment: string | null })[]];
    const updateResult = await chainCms("update-document-properties", { id, properties });
    if (!updateResult.ok) return updateResult.errorResult;

    return createToolResult({
      message: `Updated ${fieldNames.length} field(s) on "${pageName}" (saved, not published)`,
      id,
      name: pageName,
      updatedFields: fieldNames,
      previewUrl: await fetchPreviewUrl(id),
    });
  },
};

export default withStandardDecorators(tool);
