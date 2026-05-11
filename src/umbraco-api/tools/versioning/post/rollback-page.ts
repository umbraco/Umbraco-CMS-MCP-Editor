import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, encodeCursor, requestApproval } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../../cms-chain.js";

const inputSchema = {
  id: z.string().uuid().describe("The page ID to rollback"),
  // versionId uses z.guid() (permissive 8-4-4-4-12 hex) rather than z.uuid() because
  // Umbraco emits sequential version IDs like 000005e3-0000-0000-0000-000000000000
  // which don't satisfy RFC 4122's version/variant nibble checks.
  versionId: z.guid().describe("The version ID to rollback to (from list-versions)"),
  culture: z.string().optional().describe("Optional culture code for variant-specific rollback (e.g. 'en-US')"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  versionId: z.string(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "rollback-page",
  description: "Rollback a content page to a previous version. This replaces the current draft with the selected version. The published version is not affected until you publish again. Use list-versions first to find a valid versionId.",
  inputSchema,
  outputSchema,
  slices: ["update", "version"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ id, versionId, culture }, extra) => {
    // Step 1: Fetch page details for human-readable confirmation
    const docResult = await chainCms("get-document-by-id", { id });
    if (!docResult.ok) return docResult.errorResult;
    const pageName = docResult.data.variants?.[0]?.name ?? "Unknown";

    // Step 1b: Validate the version belongs to this page and capture its metadata
    const pageSize = 100;
    const versionsResult = await chainCms("get-document-version", {
      documentId: id, cursor: encodeCursor({ s: 0, t: pageSize }),
    });
    let targetVersion: { id: string; versionDate: string; user: { id: string } } | null = null;
    if (versionsResult.ok) {
      const items = versionsResult.data.items ?? [];
      const versionIds = items.map((v) => v.id);
      // Only reject if we fetched all versions (items < pageSize) and the ID wasn't found.
      // If we got a full page, the version may exist beyond what we fetched — skip the check.
      if (items.length < pageSize && versionIds.length > 0 && !versionIds.includes(versionId)) {
        return createToolResultError({
          message: `Version ${versionId} does not belong to page "${pageName}" (${id}). Use list-versions to find valid version IDs for this page.`,
        });
      }
      targetVersion = items.find((v) => v.id === versionId) ?? null;
    }

    // Step 2: Elicit confirmation (destructive action, default false). Surface the
    // target version's date and author so the editor can recognise what they're
    // rolling back to without a separate list-versions trip. The chained version
    // payload only carries the user's id — resolve it via get-user-by-id so the
    // prompt reads "by <name>" rather than a raw GUID. Format the date in the
    // runtime locale (en-GB falls through to ISO-style ordering on most runtimes
    // and produces "20 April 2026 at 15:32" rather than the raw UTC ISO string).
    const versionDate = targetVersion?.versionDate ?? null;
    const versionUserId = targetVersion?.user?.id ?? null;
    let versionUserName: string | null = null;
    if (versionUserId) {
      const userResult = await chainCms("get-user-by-id", { id: versionUserId });
      versionUserName = userResult.ok ? (userResult.data.name ?? versionUserId) : versionUserId;
    }
    const versionDateFriendly = versionDate
      ? new Date(versionDate).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })
      : null;
    const versionDetail = [
      versionDateFriendly ? `from ${versionDateFriendly}` : null,
      versionUserName ? `by ${versionUserName}` : null,
    ].filter(Boolean).join(" ");
    const confirmMessage = versionDetail
      ? `Rollback "${pageName}" to the version ${versionDetail}? This replaces the current draft. The published version is not affected until you publish again.`
      : `Rollback "${pageName}" to a previous version? This replaces the current draft. The published version is not affected until you publish again.`;

    if (!await requestApproval(extra, confirmMessage)) {
      return createToolResult({ message: "Rollback cancelled", id, name: pageName, versionId });
    }

    // Step 3: Execute rollback
    const rollbackResult = await chainCms("create-document-version-rollback", {
      id: versionId,
      ...(culture ? { culture } : {}),
    });
    if (!rollbackResult.ok) return rollbackResult.errorResult;

    return createToolResult({
      message: `Rolled back "${pageName}" to a previous version. The draft has been updated. Publish the page to make this version live.`,
      id,
      name: pageName,
      versionId,
    });
  },
};

export default withStandardDecorators(tool);
