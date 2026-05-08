import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  isoCode: z.string().describe("ISO language code of the language to update (e.g. en-US)"),
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
  name: "update-language",
  description: "Update a language's settings (default, mandatory, fallback).",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ isoCode, isDefault, isMandatory, fallbackIsoCode }) => {
    const langResult = await chainCms("get-language-by-iso-code", { isoCode });
    if (!langResult.ok) return langResult.errorResult;
    const lang = langResult.data;
    const name = lang.name ?? isoCode;

    const result = await chainCms("update-language", {
      isoCode,
      data: {
        name,
        isDefault: isDefault ?? lang.isDefault ?? false,
        isMandatory: isMandatory ?? lang.isMandatory ?? false,
        fallbackIsoCode: fallbackIsoCode ?? lang.fallbackIsoCode ?? undefined,
      },
    });
    if (!result.ok) return result.errorResult;

    return createToolResult({
      message: `Language "${name}" (${isoCode}) updated successfully`,
      isoCode,
      name,
    });
  },
};

export default withStandardDecorators(tool);
