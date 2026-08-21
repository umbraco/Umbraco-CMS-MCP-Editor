import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, confirmAction } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildPreviewUrl, previewUrlSchema } from "../../helpers/preview-url.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to rename"),
  name: z.string().min(1).describe("The new name for the page"),
  culture: z.string().optional().describe("Culture code for variant-aware document types (e.g. 'en-US'). Omit for invariant pages."),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  previousName: z.string(),
  name: z.string(),
  culture: z.string().nullable(),
  previewUrl: previewUrlSchema,
});

function matchesCulture(variant: { culture?: string | null }, culture: string | null): boolean {
  const variantCulture = variant.culture ?? null;
  return variantCulture === culture;
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "rename-page",
  description: "Rename a content page (updates the variant name). Saves as draft — does NOT publish. For variant-aware pages, pass the culture to rename only that variant; omit it for invariant pages. The page's URL segment may auto-update on next publish. You will be asked to confirm before renaming.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, name, culture }, extra) => {
    const targetCulture = culture ?? null;

    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const variants = docResult.data.variants ?? [];
    const targetVariant = variants.find((v) => matchesCulture(v, targetCulture));
    if (!targetVariant) {
      if (targetCulture) {
        return createToolResultError(`No variant found for culture "${targetCulture}". Available cultures: ${variants.map(v => v.culture ?? "(invariant)").join(", ") || "(none)"}.`);
      }
      return createToolResultError(`Document has no invariant variant. Pass a culture for this variant-aware page. Available cultures: ${variants.map(v => v.culture ?? "(invariant)").join(", ") || "(none)"}.`);
    }

    const previousName = targetVariant.name;
    if (previousName === name) {
      return createToolResult({
        message: `Page is already named "${name}" — no change`,
        id,
        previousName,
        name,
        culture: targetCulture,
        previewUrl: buildPreviewUrl(id),
      });
    }

    const cultureLabel = targetCulture ? ` (${targetCulture})` : "";
    const confirmed = await confirmAction(
      extra,
      `Rename page${cultureLabel} from "${previousName}" to "${name}"? The page URL segment may change when you next publish.`,
      { title: "Confirm rename" }
    );
    if (!confirmed) {
      return createToolResult({
        message: "Rename cancelled",
        id,
        previousName,
        name: previousName,
        culture: targetCulture,
        previewUrl: buildPreviewUrl(id),
      });
    }

    const renameResult = await chainCms("update-document-name", { id, name, culture: targetCulture });
    if (!renameResult.ok) return renameResult.errorResult;

    return createToolResult({
      message: `Renamed page${cultureLabel} from "${previousName}" to "${name}" (saved, not published)`,
      id,
      previousName,
      name,
      culture: targetCulture,
      previewUrl: buildPreviewUrl(id),
    });
  },
};

export default withStandardDecorators(tool);
