import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, requestApproval } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  isoCode: z.string().describe("ISO language code of the language to delete (e.g. fr-FR)"),
};

const outputSchema = z.object({
  message: z.string(),
  isoCode: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "delete-language",
  description: "Remove a language from the site. Content variants in this language will become inaccessible. You will be asked to confirm before deleting.",
  inputSchema,
  outputSchema,
  slices: ["delete"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ isoCode }, extra) => {
    // Step 1: Fetch language details for confirmation
    const langResult = await chainCms("get-language-by-iso-code", { isoCode });
    if (!langResult.ok) return langResult.errorResult;
    const lang = langResult.data;
    const name = lang.name ?? isoCode;

    // Step 2: Elicit confirmation with strong warning (default: false)
    const confirmMessage = `Delete language "${name}" (${isoCode})? All content variants in this language will become inaccessible.`;

    if (!await requestApproval(extra, confirmMessage)) {
      return createToolResult({ message: "Delete cancelled", isoCode, name });
    }

    // Step 3: Delete the language
    const deleteResult = await chainCms("delete-language", { isoCode });
    if (!deleteResult.ok) return deleteResult.errorResult;

    return createToolResult({
      message: `Language "${name}" (${isoCode}) deleted successfully`,
      isoCode,
      name,
    });
  },
};

export default withStandardDecorators(tool);
