import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  isoCode: z.string().describe("ISO language code to add (e.g. fr-FR)"),
  name: z.string().optional().describe("Display name for the language (e.g. 'French'). Defaults to the ISO code if not provided."),
  isDefault: z.boolean().optional().describe("Whether this language should be the default"),
  isMandatory: z.boolean().optional().describe("Whether this language should be mandatory"),
  fallbackIsoCode: z.string().optional().describe("ISO code of the fallback language"),
};

const outputSchema = z.object({
  message: z.string(),
  isoCode: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-language",
  description: "Add a new language to the site. Use this only for languages that do not yet exist — call list-languages first to avoid duplicates, and use update-language to change settings on an existing language.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ isoCode, name: displayName, isDefault, isMandatory, fallbackIsoCode }) => {
    const langName = displayName || isoCode;

    const result = await chainCms("create-language", {
      name: langName,
      isoCode,
      isDefault: isDefault ?? false,
      isMandatory: isMandatory ?? false,
      fallbackIsoCode,
    });
    if (!result.ok) return result.errorResult;
    return createToolResult({
      message: `Language "${langName}" (${isoCode}) added successfully`,
      isoCode: result.data.isoCode,
      name: langName,
    });
  },
};

export default withStandardDecorators(tool);
