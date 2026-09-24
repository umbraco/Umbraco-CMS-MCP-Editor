import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, requestApproval } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { formatDate } from "../../helpers/format-date.js";
import { fetchPreviewUrl, previewUrlSchema } from "../../helpers/preview-url.js";
import { checkHumanInTheLoop } from "../../helpers/human-in-the-loop.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to schedule for publish"),
  publishDate: z.string().datetime().describe("The date and time to publish the page (ISO 8601 format, must be in the future)"),
  culture: z.string().optional().describe("Culture code for variant-specific scheduling (e.g. 'en-US'). Omit for invariant content."),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  scheduledDate: z.string(),
  previewUrl: previewUrlSchema,
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "schedule-publish",
  description: "Schedule a page to publish at a future date. Provide the date in ISO 8601 format (must be in the future). Optionally specify a culture for variant-specific scheduling. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ id, publishDate, culture }, extra) => {
    const gate = checkHumanInTheLoop({ verb: "publish", documentId: id });
    if (gate) return gate;

    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const pageName = docResult.data.variants?.[0]?.name ?? "Unknown";

    if (!await requestApproval(extra, `Schedule "${pageName}" to publish on ${formatDate(publishDate)}?`)) {
      return createToolResult({ message: "Schedule publish cancelled", id, name: pageName, scheduledDate: publishDate, previewUrl: null });
    }

    const publishResult = await chainCms("publish-document", {
      id,
      data: { publishSchedules: [{ culture: culture ?? null, schedule: { publishTime: publishDate } }] },
    });
    if (!publishResult.ok) return publishResult.errorResult;

    const cultureLabel = culture ? ` (${culture})` : "";
    return createToolResult({
      message: `Scheduled "${pageName}"${cultureLabel} to publish on ${formatDate(publishDate)}`,
      id,
      name: pageName,
      scheduledDate: publishDate,
      previewUrl: await fetchPreviewUrl(id, culture ? { culture } : undefined),
    });
  },
};

export default withStandardDecorators(tool);
