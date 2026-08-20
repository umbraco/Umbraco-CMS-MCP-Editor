import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  name: z.string().describe("The name of the element to create"),
  elementTypeId: z.string().uuid().describe("The ID of the element type (document type) to use. Elements are created from element types — find valid IDs from an existing element (get-element) or the element configuration."),
  parentId: z.string().uuid().optional().describe("The ID of the parent folder in the Library. Elements live inside folders; omit only if creating at a location that allows root items."),
  values: z.array(z.object({
    alias: z.string().describe("The property alias"),
    value: z.any().describe("The property value"),
    culture: z.string().nullable().optional().describe("The culture code for variant content"),
    segment: z.string().nullable().optional().describe("The segment for segmented content"),
  })).optional().describe("Initial property values to set on the new element"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-and-publish-element",
  description: "Create a new Library element and publish it in one atomic operation — mirrors clicking 'Save and publish' (instead of 'Save') on the element create screen. Elements are the document-like reusable content items in the Library section. Pass `name`, `elementTypeId`, an optional parent folder `parentId`, and at most a few simple initial values. If the element type requires properties this doesn't set, or if the values fail validation, the whole operation fails and no element is created — use create-element followed by publish-element instead when you need to build up content across multiple calls before publishing.",
  inputSchema,
  outputSchema,
  slices: ["create", "publish"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ name, elementTypeId, parentId, values }) => {
    const createResult = await chainCms("create-and-publish-element", {
      documentTypeId: elementTypeId,
      name,
      values: (values ?? []).map(v => ({
        alias: v.alias,
        value: v.value,
        culture: v.culture ?? null,
        segment: v.segment ?? null,
      })),
      ...(parentId ? { parentId } : {}),
    });
    if (!createResult.ok) return createResult.errorResult;

    return createToolResult({
      message: `Created and published element "${name}"`,
      id: createResult.data.id ?? "",
      name,
    });
  },
};

export default withStandardDecorators(tool);
