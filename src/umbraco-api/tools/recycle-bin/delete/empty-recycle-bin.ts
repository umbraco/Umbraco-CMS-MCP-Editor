import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, encodeCursor, requestApproval } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { chainedTools, itemName, formatNamePreview } from "../helpers.js";
import { checkHumanInTheLoop } from "../../helpers/human-in-the-loop.js";

const inputSchema = {
  type: z.enum(["content", "media"]).describe("Which recycle bin to empty."),
};

const outputSchema = z.object({
  message: z.string(),
  type: z.enum(["content", "media"]),
  topLevelCount: z.number().describe("Number of top-level items that were in the bin before emptying (descendants are not counted)."),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "empty-recycle-bin",
  description: "Empty the entire content or media recycle bin — permanently deletes every trashed item including the contents of any trashed folders. This cannot be undone. Always elicits two successive confirmations before executing.",
  inputSchema,
  outputSchema,
  slices: ["delete"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ type }, extra) => {
    if (type === "content") {
      const gate = checkHumanInTheLoop({ verb: "delete" });
      if (gate) return gate;
    }

    const tools = chainedTools(type);

    // Step 1: Peek at the bin so the elicitation can name what will be destroyed.
    const peekResult = await chainCms(tools.listRoot, {
      cursor: encodeCursor({ s: 0, t: 10 }),
    });
    if (!peekResult.ok) return peekResult.errorResult;
    const topLevelCount: number = peekResult.data.total ?? 0;
    const sampleNames: string[] = (peekResult.data.items ?? []).map((i) => itemName(i));

    if (topLevelCount === 0) {
      return createToolResult({
        message: `The ${type} recycle bin is already empty`,
        type,
        topLevelCount: 0,
      });
    }

    const kindLabel = type === "media" ? "media" : "content";
    const preview = sampleNames.length > 0 ? ` Top-level items include: ${formatNamePreview(sampleNames, topLevelCount)}.` : "";

    // Step 2: First confirmation — scope.
    const firstMessage = `Empty the entire ${kindLabel} recycle bin? This will permanently delete ${topLevelCount} top-level item${topLevelCount === 1 ? "" : "s"} AND every descendant inside any trashed folders.${preview}`;
    if (!await requestApproval(extra, firstMessage)) {
      return createToolResult({
        message: "Empty recycle bin cancelled",
        type,
        topLevelCount,
      });
    }

    // Step 3: Second confirmation — finality. Yes/no is easy to misfire on bulk destructive ops;
    // requiring a second prompt forces the user to re-acknowledge before we wipe the bin.
    const secondMessage = `Really sure? This **cannot** be undone. ${topLevelCount} item${topLevelCount === 1 ? "" : "s"} plus every nested descendant will be permanently destroyed.`;
    if (!await requestApproval(extra, secondMessage)) {
      return createToolResult({
        message: "Empty recycle bin cancelled",
        type,
        topLevelCount,
      });
    }

    // Step 4: Execute.
    const emptyResult = await chainCms(tools.empty, {});
    if (!emptyResult.ok) return emptyResult.errorResult;

    return createToolResult({
      message: `Emptied the ${kindLabel} recycle bin — permanently deleted ${topLevelCount} top-level item${topLevelCount === 1 ? "" : "s"} and all nested descendants`,
      type,
      topLevelCount,
    });
  },
};

export default withStandardDecorators(tool);
