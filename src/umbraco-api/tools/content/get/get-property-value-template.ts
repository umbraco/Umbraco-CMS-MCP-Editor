import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
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
    const result = await chainCms("get-document-property-value-template", editorAlias ? { editorAlias } : {});
    if (!result.ok) return result.errorResult;
    // The dev tool returns plain text content; pass it through as the message.
    const data = result.data as any;
    const text = typeof data === "string"
      ? data
      : data?.content?.[0]?.text
        ?? data?.text
        ?? JSON.stringify(data);
    return createToolResult({
      message: text,
      ...(editorAlias ? { editorAlias } : {}),
    });
  },
};

export default withStandardDecorators(tool);
