import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";
import { confirmStep } from "../../helpers/confirm-step.js";
import { formatDate } from "../../helpers/format-date.js";

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
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "schedule-publish",
  description: "Schedule a page to publish at a future date. Provide the date in ISO 8601 format (must be in the future). Optionally specify a culture for variant-specific scheduling. You will be asked to confirm.",
  inputSchema,
  outputSchema,
  slices: ["publish"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  handler: async ({ id, publishDate, culture }, extra) => {
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const pageName = docResult.data.variants?.[0]?.name ?? "Unknown";

    if (!await confirmStep(extra, `Schedule "${pageName}" to publish on ${formatDate(publishDate)}?`)) {
      return createToolResult({ message: "Schedule publish cancelled", id, name: pageName, scheduledDate: publishDate });
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
    });
  },
};

export default withStandardDecorators(tool);
