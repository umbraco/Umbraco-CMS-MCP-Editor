import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to copy a variant on"),
  sourceCulture: z.string().describe("The source language ISO code to copy content from (e.g. 'en-US')"),
  targetCulture: z.string().describe("The target language ISO code to copy content to (e.g. 'da-DK')"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  sourceCulture: z.string(),
  targetCulture: z.string(),
  copiedFields: z.array(z.string()),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "copy-variant",
  description: "Copy all content from one language variant to another as a starting point for translation. Overwrites the target variant's content. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, sourceCulture, targetCulture }, extra) => {
    // Step 1: Fetch page details
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);

    const existingVariants: any[] = doc.variants ?? [];
    const existingValues: any[] = doc.values ?? [];
    const pageName = existingVariants[0]?.name ?? doc.name ?? "Unknown";

    // Step 2: Find values for the source culture
    const sourceValues = existingValues.filter((v: any) => v.culture === sourceCulture);
    const copiedFields = sourceValues.map((v: any) => v.alias);

    // Step 3: Build copied values with the target culture
    const copiedValues = sourceValues.map((v: any) => ({
      ...v,
      culture: targetCulture,
    }));

    // Step 4: Confirm
    if (!await confirmAction(
      extra,
      `Copy ${sourceCulture} content to ${targetCulture} for "${pageName}"? This will overwrite any existing ${targetCulture} content.`,
      { title: "Confirm copy variant" }
    )) {
      return createToolResult({ message: "Copy variant cancelled", id, name: pageName, sourceCulture, targetCulture, copiedFields: [] });
    }

    // Step 5: Merge — replace existing targetCulture values with copied ones, add any new ones
    const copiedAliases = new Set(copiedValues.map((v: any) => v.alias));
    const retainedValues = existingValues.filter(
      (v: any) => !(v.culture === targetCulture && copiedAliases.has(v.alias))
    );
    const mergedValues = [...retainedValues, ...copiedValues];

    // Step 6: Ensure target culture variant exists
    const targetVariantExists = existingVariants.some((v: any) => v.culture === targetCulture);
    const updatedVariants = targetVariantExists
      ? existingVariants
      : [...existingVariants, { culture: targetCulture, name: pageName, segment: null }];

    // Step 7: Delegate to update-document
    const updateResult = await mcpClientManager.callTool("cms", "update-document", {
      id,
      variants: updatedVariants,
      values: mergedValues,
    });
    if (updateResult.isError) return createToolResultError(updateResult);

    return createToolResult({
      message: `Copied ${sourceCulture} content to ${targetCulture} for "${pageName}" (${copiedFields.length} field(s))`,
      id,
      name: pageName,
      sourceCulture,
      targetCulture,
      copiedFields,
    });
  },
};

export default withStandardDecorators(tool);
