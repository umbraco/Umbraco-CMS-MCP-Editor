import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { confirmStep } from "../../helpers/confirm-step.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the content page to remove public access restrictions from"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "remove-public-access",
  description: "Remove all public access restrictions from a content page, making it publicly viewable again. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["delete"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  handler: async ({ id }, extra) => {
    if (!await confirmStep(extra, `Remove public access restrictions from this page? The page will become publicly viewable again.`)) {
      return createToolResult({ message: "Remove cancelled", id });
    }

    const result = await chainCms("delete-document-public-access", { id });
    if (!result.ok) return result.errorResult;

    return createToolResult({
      message: "Removed public access restrictions",
      id,
    });
  },
};

export default withStandardDecorators(tool);
