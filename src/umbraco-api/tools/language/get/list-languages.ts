import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

const inputSchema = {
  take: z.number().optional().default(50).describe("Number of results to return (default 50)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    isoCode: z.string().describe("ISO language code (e.g. en-US)"),
    name: z.string().describe("Display name of the language"),
    isDefault: z.boolean().describe("Whether this is the default language"),
    isMandatory: z.boolean().describe("Whether this language is mandatory"),
  })).describe("List of configured languages"),
  total: z.number().describe("Total number of languages"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-languages",
  description: "List all languages configured on the Umbraco site. Shows the ISO code, name, and whether each language is the default or mandatory.",
  inputSchema,
  outputSchema,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  handler: async ({ take, skip }) => {
    const result = await chainCms("get-language", { cursor: buildChainedCursor(skip, take) });
    if (!result.ok) return result.errorResult;
    const data = result.data;
    return createToolResult({
      items: (data.items ?? []).map((item) => ({
        isoCode: item.isoCode,
        name: item.name,
        isDefault: item.isDefault,
        isMandatory: item.isMandatory,
      })),
      total: data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
