import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the element to edit"),
  values: z.array(z.object({
    alias: z.string().describe("The property alias"),
    value: z.any().describe("The new property value"),
    culture: z.string().nullable().optional().describe("The culture code for variant content"),
    segment: z.string().nullable().optional().describe("The segment for segmented content"),
  })).describe("Property values to update on the element"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  updatedFields: z.array(z.string()),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "edit-element",
  description: "Update property values on a Library element. Changes are saved but NOT published — publish separately with publish-element. Call get-element first to discover valid property aliases. For structured non-block property values (media pickers, pickers, etc.) call get-property-value-template with the editor alias first to see the expected JSON shape. To change a property INSIDE a block on the element (BlockList, BlockGrid, or Rich Text block) use inspect-element-blocks then edit-element-block instead — passing a whole block value here would overwrite the property's entire block structure. Elements are the document-like reusable content items in the Library section (Umbraco 18).",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, values }) => {
    const elResult = await chainCms("get-element-by-id", { id });
    if (!elResult.ok) return elResult.errorResult;
    const elementName = (elResult.data as any).variants?.[0]?.name ?? "Unknown";
    const fieldNames = values.map((v) => v.alias);

    const properties = values.map(v => ({
      alias: v.alias,
      value: v.value,
      culture: v.culture ?? null,
      segment: v.segment ?? null,
    })) as [(typeof values)[number] & { culture: string | null; segment: string | null }, ...((typeof values)[number] & { culture: string | null; segment: string | null })[]];
    const updateResult = await chainCms("update-element-properties", { id, properties });
    if (!updateResult.ok) return updateResult.errorResult;

    return createToolResult({
      message: `Updated ${fieldNames.length} field(s) on element "${elementName}" (saved, not published)`,
      id,
      name: elementName,
      updatedFields: fieldNames,
    });
  },
};

export default withStandardDecorators(tool);
