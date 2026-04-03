import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

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
    const toolName = parentId
      ? "get-document-blueprint-children"
      : "get-document-blueprint-root";

    const args: Record<string, unknown> = { take, skip };
    if (parentId) args.parentId = parentId;

    const result = await mcpClientManager.callTool("cms", toolName, args);
    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);

    return createToolResult({
      items: (data.items ?? []).map((item: any) => ({
        id: item.id,
        name: item.name ?? item.variants?.[0]?.name ?? "Unknown",
        documentType: item.documentType?.name ?? item.documentType?.alias ?? undefined,
      })),
      total: data.total ?? 0,
    });
  },
};

export default withStandardDecorators(tool);
