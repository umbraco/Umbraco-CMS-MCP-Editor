import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";

const inputSchema = {
  id: z.string().uuid().describe("The unique ID of the page to compare"),
};

const changeTypeSchema = z.enum(["added", "modified", "removed"]);

const changeSchema = z.object({
  alias: z.string(),
  culture: z.string().nullable(),
  segment: z.string().nullable(),
  changeType: changeTypeSchema,
  draftValue: z.any().optional(),
  publishedValue: z.any().optional(),
});

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  documentType: z.object({ id: z.string() }),
  publishStatus: z.enum(["Published", "NotPublished", "PendingChanges"]),
  hasDraftChanges: z.boolean(),
  summary: z.string(),
  changes: z.array(changeSchema),
});

interface DocumentValue {
  alias: string;
  value: unknown;
  culture?: string | null;
  segment?: string | null;
}

function valueKey(v: DocumentValue): string {
  return `${v.alias}:${v.culture ?? ""}:${v.segment ?? ""}`;
}

function summariseValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const v = value as any;

  if (Array.isArray(v.contentData) && Array.isArray(v.settingsData)) {
    return {
      _blockSummary: true,
      blockCount: v.contentData.length,
      hint: "Use inspect-blocks to see block details",
    };
  }

  if (typeof v.markup === "string" && v.blocks && Array.isArray(v.blocks?.contentData)) {
    return {
      _blockSummary: true,
      markup: v.markup,
      blockCount: v.blocks.contentData.length,
    };
  }

  return value;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function buildSummary(changes: Array<{ alias: string }>, publishStatus: string): string {
  if (changes.length === 0) {
    if (publishStatus === "NotPublished") return "Page has never been published and has no content changes to compare";
    return "No changes between draft and published";
  }
  const uniqueAliases = Array.from(new Set(changes.map((c) => c.alias)));
  const shown = uniqueAliases.slice(0, 5).join(", ");
  const extra = uniqueAliases.length > 5 ? `, and ${uniqueAliases.length - 5} more` : "";
  return `${uniqueAliases.length} propert${uniqueAliases.length === 1 ? "y" : "ies"} changed: ${shown}${extra}`;
}

async function findPublishedVersionId(documentId: string): Promise<string | null> {
  const pageSize = 100;
  let skip = 0;
  while (true) {
    const versionsResult = await mcpClientManager.callTool("cms", "get-document-version", {
      documentId,
      skip,
      take: pageSize,
    });
    if (versionsResult.isError) return null;
    const data = extractChainedResult(versionsResult);
    const items = data?.items ?? [];
    if (items.length === 0) return null;
    const published = items.find((v: any) => v.isCurrentPublishedVersion === true);
    if (published) return published.id;
    if (items.length < pageSize) return null;
    skip += pageSize;
    if (skip >= (data?.total ?? 0)) return null;
  }
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "compare-draft-to-published",
  description: "Show what has changed between a page's current draft and its live published version. Returns a per-property diff so an editor can review pending changes before publishing -- or audit what differs after edits over time. Block-based properties are summarised (use inspect-blocks for detail). If the page has never been published, every non-empty draft property is reported as 'added'.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const draftResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (draftResult.isError) return createToolResultError(draftResult);
    const draft = extractChainedResult(draftResult);
    const name = draft.variants?.[0]?.name ?? draft.name ?? "Unknown";
    const documentTypeId = draft.documentType?.id ?? "";
    const draftValues: DocumentValue[] = draft.values ?? [];

    const publishedVersionId = await findPublishedVersionId(id);

    if (!publishedVersionId) {
      const changes = draftValues
        .filter((v) => v.value !== null && v.value !== undefined && v.value !== "")
        .map((v) => ({
          alias: v.alias,
          culture: v.culture ?? null,
          segment: v.segment ?? null,
          changeType: "added" as const,
          draftValue: summariseValue(v.value),
        }));
      return createToolResult({
        id,
        name,
        documentType: { id: documentTypeId },
        publishStatus: "NotPublished",
        hasDraftChanges: changes.length > 0,
        summary: changes.length > 0
          ? `Page has never been published -- ${changes.length} propert${changes.length === 1 ? "y" : "ies"} would go live on first publish`
          : "Page has never been published and has no content changes to compare",
        changes,
      });
    }

    const publishedResult = await mcpClientManager.callTool("cms", "get-document-version-by-id", { id: publishedVersionId });
    if (publishedResult.isError) return createToolResultError(publishedResult);
    const published = extractChainedResult(publishedResult);
    const publishedValues: DocumentValue[] = published.values ?? [];

    const draftMap = new Map<string, DocumentValue>();
    for (const v of draftValues) draftMap.set(valueKey(v), v);
    const publishedMap = new Map<string, DocumentValue>();
    for (const v of publishedValues) publishedMap.set(valueKey(v), v);

    const changes: z.infer<typeof changeSchema>[] = [];
    const seen = new Set<string>();

    for (const [key, draftVal] of draftMap) {
      seen.add(key);
      const publishedVal = publishedMap.get(key);
      if (publishedVal === undefined) {
        changes.push({
          alias: draftVal.alias,
          culture: draftVal.culture ?? null,
          segment: draftVal.segment ?? null,
          changeType: "added",
          draftValue: summariseValue(draftVal.value),
        });
      } else if (!valuesEqual(draftVal.value, publishedVal.value)) {
        changes.push({
          alias: draftVal.alias,
          culture: draftVal.culture ?? null,
          segment: draftVal.segment ?? null,
          changeType: "modified",
          draftValue: summariseValue(draftVal.value),
          publishedValue: summariseValue(publishedVal.value),
        });
      }
    }

    for (const [key, publishedVal] of publishedMap) {
      if (seen.has(key)) continue;
      changes.push({
        alias: publishedVal.alias,
        culture: publishedVal.culture ?? null,
        segment: publishedVal.segment ?? null,
        changeType: "removed",
        publishedValue: summariseValue(publishedVal.value),
      });
    }

    const hasDraftChanges = changes.length > 0;
    const publishStatus: "Published" | "PendingChanges" = hasDraftChanges ? "PendingChanges" : "Published";

    return createToolResult({
      id,
      name,
      documentType: { id: documentTypeId },
      publishStatus,
      hasDraftChanges,
      summary: buildSummary(changes, publishStatus),
      changes,
    });
  },
};

export default withStandardDecorators(tool);
