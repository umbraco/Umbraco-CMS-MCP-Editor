import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The unique ID of the element to retrieve"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  elementType: z.object({ id: z.string() }).describe("The element type (document type) this element is based on"),
  values: z.array(z.object({ alias: z.string(), value: z.any() }).passthrough()).describe("Property field values"),
  variants: z.array(z.object({ name: z.string() }).passthrough()).describe("Language/culture variants"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-element",
  description: "Get the full details of a Library element — its element type, all property values, and culture variants. Elements are the document-like reusable content items that live in the Library section. Use this after search-elements or list-element-children to see what an element contains, and before edit-element to discover valid property aliases.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const result = await chainCms("get-element-by-id", { id });
    if (!result.ok) return result.errorResult;
    const el = result.data as any;
    return createToolResult({
      id: el.id,
      name: el.variants?.[0]?.name ?? "Unknown",
      elementType: { id: el.documentType?.id ?? el.elementType?.id ?? "" },
      values: el.values ?? [],
      variants: el.variants ?? [],
    });
  },
};

export default withStandardDecorators(tool);
