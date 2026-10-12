import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { resolveEditorAliases } from "../../content/helpers/resolve-editor-aliases.js";

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
  name: "create-element",
  description: "Create a new Library element as a draft — it is NOT published automatically. Elements are the document-like reusable content items in the Library section. Pass `name`, `elementTypeId`, an optional parent folder `parentId`, and at most a few simple initial values. For everything else, follow up after creation with edit-element for property updates. Publish separately with publish-element.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ name, elementTypeId, parentId, values }) => {
    // create-element (like create-document) requires editorAlias on each value.
    // The LLM only supplies the property alias, so resolve editorAlias by looking
    // up the element type's own + composition-inherited properties -> their data
    // types -> editorAlias. Element types are document types (isElement), so
    // resolveEditorAliases (built on get-document-type-by-id) applies. Fails fast
    // (before calling Umbraco) when an alias isn't a property on this element type
    // at all, own or inherited — see #201, #208.
    const resolved = await resolveEditorAliases(elementTypeId, values);
    if (!resolved.ok) return resolved.errorResult;

    const createResult = await chainCms("create-element", {
      documentTypeId: elementTypeId,
      name,
      values: resolved.values,
      ...(parentId ? { parentId } : {}),
    });
    if (!createResult.ok) return createResult.errorResult;

    return createToolResult({
      message: `Created draft element "${name}"`,
      id: createResult.data.id ?? "",
      name,
    });
  },
};

export default withStandardDecorators(tool);
