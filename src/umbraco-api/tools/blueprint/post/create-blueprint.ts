import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  pageId: z.string().uuid().describe("The ID of the source page to save as a blueprint"),
  name: z.string().describe("The name for the new blueprint"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "create-blueprint",
  description: "Save an existing page as a reusable blueprint (template). The blueprint preserves the page's document type and property values.",
  inputSchema,
  outputSchema,
  slices: ["create"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ pageId, name }) => {
    let pageName = pageId;
    const pageResult = await chainCms("get-document-by-id", { id: pageId });
    if (pageResult.ok) {
      pageName = pageResult.data.variants?.[0]?.name ?? pageId;
    }

    const createResult = await chainCms("create-document-blueprint-from-document", {
      document: { id: pageId },
      name,
    });
    if (!createResult.ok) return createResult.errorResult;

    // The dev MCP does not declare an outputSchema for this tool, so chainCms
    // returns the data as `unknown`, and may return undefined if the upstream
    // response had no parseable structuredContent. Narrow defensively at this
    // single boundary.
    const created = createResult.data as { id?: string } | undefined;
    const createdId = created?.id ?? "";

    return createToolResult({
      message: `Created blueprint "${name}" from page "${pageName}"`,
      id: createdId,
      name,
    });
  },
};

export default withStandardDecorators(tool);
