import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to add a language variant to"),
  culture: z.string().describe("The target language ISO code (e.g. 'da-DK', 'fr-FR'). Call list-languages to find available cultures."),
  values: z.array(z.object({
    alias: z.string().describe("The property alias"),
    value: z.any().describe("The property value"),
    culture: z.string().optional().describe("Culture code — defaults to the target culture if omitted"),
    segment: z.string().nullable().optional().describe("The segment for segmented content"),
  })).optional().describe("Optional property values to set on the new variant"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  culture: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-variant",
  description: "Create a new language variant for a content page. Call list-languages to find available cultures. Optionally provide property values for the new variant. You will be asked to confirm before creating.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ id, culture, values }, extra) => {
    // Step 1: Fetch page details
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);

    const existingVariants: any[] = doc.variants ?? [];
    const existingValues: any[] = doc.values ?? [];
    const pageName = existingVariants[0]?.name ?? doc.name ?? "Unknown";

    // Step 2: Check if variant already exists
    const variantExists = existingVariants.some((v: any) => v.culture === culture);
    if (variantExists) {
      return createToolResultError({ isError: true, content: [{ type: "text", text: `Variant for ${culture} already exists on this page` }] });
    }

    // Step 3: Confirm
    if (!await confirmAction(extra, `Create ${culture} variant for "${pageName}"?`, { title: "Confirm create variant" })) {
      return createToolResult({ message: "Create variant cancelled", id, name: pageName, culture });
    }

    // Step 4: Build new variant and values payload
    const newVariant = { culture, name: pageName, segment: null };
    const newCultureValues = (values ?? []).map((v) => ({
      alias: v.alias,
      value: v.value,
      culture: v.culture ?? culture,
      segment: v.segment ?? null,
    }));

    // Step 5: Delegate to update-document
    const updateResult = await mcpClientManager.callTool("cms", "update-document", {
      id,
      data: {
        variants: [...existingVariants, newVariant],
        values: [...existingValues, ...newCultureValues],
      },
    });
    if (updateResult.isError) return createToolResultError(updateResult);

    return createToolResult({
      message: `Created ${culture} variant for "${pageName}"`,
      id,
      name: pageName,
      culture,
    });
  },
};

export default withStandardDecorators(tool);
