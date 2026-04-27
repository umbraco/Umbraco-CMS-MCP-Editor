import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { buildChainedCursor } from "../../helpers/tree-walker.js";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("The ID of a blueprint folder to list children of. If omitted, lists root-level blueprints."),
  take: z.number().optional().default(50).describe("Number of results to return"),
  skip: z.number().optional().default(0).describe("Number of results to skip"),
};

const outputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    name: z.string(),
    documentType: z.string().optional().describe("The document type alias or name this blueprint is based on"),
  })).describe("Available page blueprints"),
  total: z.number(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "list-blueprints",
  description: "List available page blueprints (templates with pre-filled content). Use get-blueprint to view a blueprint's details and property values.",
  inputSchema,
  outputSchema,
  slices: ["list"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, take, skip }) => {
    const cursor = buildChainedCursor(skip, take);
    const result = parentId
      ? await chainCms("get-document-blueprint-children", { parentId, cursor })
      : await chainCms("get-document-blueprint-root", { cursor });

    if (!result.ok) return result.errorResult;

    return createToolResult({
      items: (result.data.items ?? []).map((item) => ({
        id: item.id,
        name: item.name ?? "Unknown",
        documentType: item.documentType?.id ?? undefined,
      })),
      total: result.data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
