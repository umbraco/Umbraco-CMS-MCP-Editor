import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { confirmStep } from "../../helpers/confirm-step.js";
import { chainedTools, itemName, probeSubtree, formatNamePreview, SUBTREE_PROBE_LIMIT } from "../helpers.js";

const inputSchema = {
  id: z.string().uuid().describe("ID of the trashed item to permanently delete."),
  type: z.enum(["content", "media"]).describe("Which recycle bin the item is in."),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  descendantCount: z.number().optional().describe("Descendants also deleted when the item was a folder"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "permanent-delete-recycle-bin-item",
  description: "Permanently delete a single item from the content or media recycle bin. Deleting a trashed folder deletes its entire subtree. This cannot be undone. Always elicits confirmation with an itemised preview before deleting.",
  inputSchema,
  outputSchema,
  slices: ["delete"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id, type }, extra) => {
    const tools = chainedTools(type);

    // Step 1: Look the item up so the elicitation can name it rather than show a GUID.
    const itemResult = type === "media"
      ? await chainCms("get-media-by-id", { id })
      : await chainCms("get-document-by-id", { id });
    if (!itemResult.ok) return itemResult.errorResult;
    const item = itemResult.data;
    const name = itemName(item);

    // Step 2: Resolve the original parent id when the API can tell us.
    let originalParentId: string | null = null;
    const parentResult = await chainCms(tools.originalParent, { id });
    if (parentResult.ok) {
      // extractChainedResult may return undefined for empty bodies — narrow defensively.
      originalParentId = (parentResult.data as { id?: string } | undefined)?.id ?? null;
    }
    const locationSuffix = originalParentId
      ? ` (originally under ${originalParentId})`
      : " (originally at the root)";

    // Step 3: Probe the subtree. `get-{media,document}-by-id` doesn't expose hasChildren,
    // so we always probe; zero descendants means it's a leaf.
    const probe = await probeSubtree(type, id, SUBTREE_PROBE_LIMIT);
    const descendantCount = probe.descendantCount;
    const sampleNames = probe.sampleNames;
    const truncated = probe.truncated;
    const hasChildren = descendantCount > 0;

    // Step 4: Build the elicitation message.
    const kindLabel = type === "media" ? "media item" : "page";
    let message: string;
    if (!hasChildren) {
      message = `Permanently delete ${kindLabel} "${name}"${locationSuffix}? This **cannot** be undone.`;
    } else {
      const preview = sampleNames.length > 0
        ? ` Includes descendants: ${formatNamePreview(sampleNames, descendantCount)}.`
        : "";
      const tail = truncated ? ` Subtree probe was capped at ${SUBTREE_PROBE_LIMIT} — the real number of descendants may be higher.` : "";
      message = `Permanently delete trashed folder "${name}"${locationSuffix} AND every descendant beneath it — ${descendantCount}${truncated ? "+" : ""} item${descendantCount === 1 ? "" : "s"}.${preview} This **cannot** be undone.${tail}`;
    }

    // Step 5: Destructive defaults — unchecked, explicit title.
    if (!await confirmStep(extra, message)) {
      return createToolResult({
        message: "Permanent delete cancelled",
        id,
        name,
        descendantCount: hasChildren ? descendantCount : undefined,
      });
    }

    // Step 6: Execute.
    const deleteResult = await chainCms(tools.permanentDelete, { id });
    if (!deleteResult.ok) return deleteResult.errorResult;

    return createToolResult({
      message: hasChildren
        ? `Permanently deleted "${name}" and its ${descendantCount}${truncated ? "+" : ""} descendant${descendantCount === 1 ? "" : "s"} from the ${type} recycle bin`
        : `Permanently deleted "${name}" from the ${type} recycle bin`,
      id,
      name,
      descendantCount: hasChildren ? descendantCount : undefined,
    });
  },
};

export default withStandardDecorators(tool);
