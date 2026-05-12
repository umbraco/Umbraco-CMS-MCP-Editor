import { z } from "zod";
import {
  withStandardDecorators,
  createToolResult,
  requestApproval,
  ToolDefinition,
} from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to unpublish"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "unpublish-page",
  description:
    "Unpublish a content page, removing it from the live website. The page will still exist as a draft. You will be asked to confirm before unpublishing.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id }, extra) => {
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const doc = docResult.data;
    const pageName = doc.variants?.[0]?.name ?? "Unknown";

    if (!await requestApproval(extra, `Unpublish "${pageName}"? This will remove it from the live website.`)) {
      return createToolResult({ message: "Unpublish cancelled", id, name: pageName });
    }

    // Pass cultures: null for invariant content ([] is rejected by the API)
    const cultures = (doc.variants ?? []).filter(v => v.culture).map(v => v.culture as string);
    const result = await chainCms("unpublish-document", {
      id, data: { cultures: cultures.length > 0 ? cultures : null },
    });
    if (!result.ok) return result.errorResult;

    return createToolResult({ message: `Unpublished "${pageName}" — it is now a draft only`, id, name: pageName });
  },
};

export default withStandardDecorators(tool);
