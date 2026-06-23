import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  editorAlias: z.string().optional().describe("The property editor alias (e.g. 'Umbraco.TextBox', 'Umbraco.MediaPicker3', 'Umbraco.BlockList'). Omit to get the list of available editor aliases."),
};

const outputSchema = z.object({
  message: z.string().describe("Free-text response from Umbraco — either the available-editors list, or the requested editor's value-shape template plus notes."),
  editorAlias: z.string().optional().describe("The matched editor alias when one was supplied"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-property-value-template",
  description: "Get the expected JSON value shape for a *non-block* structured property editor — Umbraco.MediaPicker3, Umbraco.MultiNodeTreePicker, Umbraco.ImageCropper, Umbraco.Slider, Umbraco.ColorPicker, Umbraco.DateTime, Umbraco.MultiUrlPicker, etc. Use this before calling edit-page, create-page (initial values only), bulk-set-property, or before composing inner-block property values for edit-block / add-blocklist-block / add-blockgrid-block / add-rte-block. DO NOT use this template tool to hand-construct BlockList / BlockGrid / Rich-Text-with-blocks values — call the dedicated tools instead: inspect-blocks (read), add-blocklist-block / add-blockgrid-block / add-rte-block (add), edit-block (update). They handle UUID generation, layout, expose, and (for RTE) markup wiring correctly. Omit editorAlias to list every available editor. Pass it (e.g. 'Umbraco.MediaPicker3') to get the value shape with example data and notes.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ editorAlias }) => {
    const findResult = await chainCms("find-data-type", editorAlias ? { editorAlias } : {});
    if (!findResult.ok) return findResult.errorResult;

    if (!editorAlias) {
      const aliases = Array.from(new Set(findResult.data.items.map((item) => item.editorAlias))).sort();
      return createToolResult({
        message: `Available editor aliases (${aliases.length}):\n${aliases.join("\n")}`,
      });
    }

    const match = findResult.data.items[0];
    if (!match) {
      return createToolResultError({
        detail: `No data type found with editorAlias "${editorAlias}".`,
      });
    }

    const schemaResult = await chainCms("get-data-type-schema", { id: match.id });
    if (!schemaResult.ok) return schemaResult.errorResult;

    return createToolResult({
      message: JSON.stringify(schemaResult.data, null, 2),
      editorAlias,
    });
  },
};

export default withStandardDecorators(tool);
