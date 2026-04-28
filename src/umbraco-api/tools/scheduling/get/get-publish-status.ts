import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to check publish status for"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  isPublished: z.boolean(),
  state: z.string(),
  variants: z.array(
    z.object({
      name: z.string(),
      culture: z.string().nullable(),
      state: z.string(),
      publishDate: z.string().nullable(),
      scheduledPublishDate: z.string().nullable(),
      scheduledUnpublishDate: z.string().nullable(),
    })
  ),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-publish-status",
  description: "View a page's current publish state including any scheduled publish or unpublish dates. Shows per-variant status for multilingual sites. Returns empty variants for unpublished pages.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const doc = docResult.data;
    const name = doc.variants?.[0]?.name ?? "Unknown";

    // The draft document is the source of truth for both current state and
    // any pending schedule — get-document-publish 404s on unpublished pages
    // (losing schedule info), and even when it succeeds it mirrors the same
    // schedule fields, so we read everything from the draft.
    const variants = (doc.variants ?? []).map((v) => ({
      name: v.name ?? "",
      culture: v.culture ?? null,
      state: v.state ?? "Unknown",
      publishDate: v.publishDate ?? null,
      scheduledPublishDate: v.scheduledPublishDate ?? null,
      scheduledUnpublishDate: v.scheduledUnpublishDate ?? null,
    }));

    const isPublished = variants.some(
      (v) => v.state === "Published" || v.state === "PublishedPendingChanges",
    );
    const overallState = isPublished ? "Published" : "NotPublished";

    return createToolResult({
      id,
      name,
      isPublished,
      state: overallState,
      variants,
    });
  },
};

export default withStandardDecorators(tool);
