import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, requestApproval } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { checkVariesByCulture } from "../helpers/check-varies-by-culture.js";
import { fetchPreviewUrl, previewUrlSchema } from "../../helpers/preview-url.js";
import { validateDocumentState, validationResultSchema } from "../../helpers/validate-document.js";

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
  previewUrl: previewUrlSchema,
  validation: validationResultSchema,
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "copy-variant",
  description: "Copy all content from one language variant to another as a starting point for translation. Overwrites the target variant's content and creates the variant if it does not exist — you will be asked to confirm. Note: Umbraco supports language fallback chains, so a property left unset on a variant can fall back to the default language automatically — copy-variant is for when you want explicit content per culture rather than relying on fallback.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id, sourceCulture, targetCulture }, extra) => {
    const variesError = await checkVariesByCulture(id);
    if (variesError) return variesError;

    // Step 1: Fetch page details
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const doc = docResult.data;

    const existingVariants: any[] = doc.variants ?? [];
    const existingValues: any[] = doc.values ?? [];
    const pageName = existingVariants[0]?.name ?? "Unknown";

    // Step 2: Find values for the source culture
    const sourceValues = existingValues.filter((v: any) => v.culture === sourceCulture);
    const copiedFields = sourceValues.map((v: any) => v.alias);

    // Step 3: Build copied values with the target culture
    const copiedValues = sourceValues.map((v: any) => ({
      ...v,
      culture: targetCulture,
    }));

    // Step 4: Confirm. Show the editor exactly what's at stake — how many fields
    // will be copied, and whether the target variant already has content that
    // will be replaced.
    const existingTargetFieldCount = existingValues.filter((v: any) => v.culture === targetCulture).length;
    const overwriteWarning = existingTargetFieldCount > 0
      ? ` ⚠️  This will overwrite ${existingTargetFieldCount} existing ${targetCulture} field(s).`
      : "";
    const confirmMessage = `Copy ${copiedFields.length} field(s) from ${sourceCulture} to ${targetCulture} on "${pageName}"?${overwriteWarning}`;
    if (!await requestApproval(extra, confirmMessage)) {
      return createToolResult({ message: "Copy variant cancelled", id, name: pageName, sourceCulture, targetCulture, copiedFields: [], previewUrl: null, validation: { valid: true, errors: [] } });
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
    const updateResult = await chainCms("update-document", {
      id,
      data: {
        variants: updatedVariants,
        values: mergedValues,
      },
    });
    if (!updateResult.ok) return updateResult.errorResult;

    const validation = await validateDocumentState(id);
    const baseMessage = `Copied ${sourceCulture} content to ${targetCulture} for "${pageName}" (${copiedFields.length} field(s))`;
    const message = validation.valid
      ? baseMessage
      : `${baseMessage} — but ${validation.errors.length} validation error(s) must be resolved before this page can be published`;

    return createToolResult({
      message,
      id,
      name: pageName,
      sourceCulture,
      targetCulture,
      copiedFields,
      previewUrl: await fetchPreviewUrl(id, { culture: targetCulture }),
      validation,
    });
  },
};

export default withStandardDecorators(tool);
