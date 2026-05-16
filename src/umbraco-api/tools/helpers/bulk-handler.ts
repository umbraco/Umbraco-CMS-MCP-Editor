/**
 * Bulk Operation Handler
 *
 * Shared helper for bulk tools. Encapsulates the validate → fetch → confirm → execute flow
 * with 10-item hard cap, per-item confirmation, sequential execution, and rollback support.
 */

import { encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../cms-chain.js";

const MAX_BULK_ITEMS = 10;
export const SKIPPED_SENTINEL = "Skipped — previous item failed";

export interface BulkItemDetail {
  id: string;
  name: string;
  currentVersionId: string;
  /**
   * One entry per variant; `null` for invariant content. Set by the document
   * `fetchBulkItemDetails` helper for callers that need to derive
   * `publishSchedules`. Optional because non-document bulk tools (media moves,
   * block-property edits) don't need it.
   */
  cultures?: Array<string | null>;
  extra?: Record<string, any>;
}

export interface BulkResult {
  id: string;
  name: string;
  success: boolean;
  previousVersionId?: string;
  error?: unknown;
  /**
   * Backoffice preview URL for the per-item draft. Populated only when the
   * caller passes a previewUrl in via the post-success hook — bulk tools that
   * mutate per-page content (bulk-set-property, bulk-set-block-property, bulk-move)
   * should set it; tools that operate on the page outside of editable content
   * (bulk-schedule-publish) may leave it absent.
   */
  previewUrl?: { url: string; requiresBackofficeAuth: true } | null;
  /**
   * Server-side validation outcome for the saved per-item draft. Only present
   * on bulk save tools (bulk-set-property, bulk-set-block-property). When
   * `valid` is false the row's edits were saved but the page cannot be
   * published until the listed errors are resolved.
   */
  validation?: {
    valid: boolean;
    errors: Array<{
      propertyAlias: string;
      culture?: string | null;
      segment?: string | null;
      message: string;
    }>;
  };
  /**
   * Live public URLs the page resolved to BEFORE the bulk operation. Populated
   * by destructive bulk tools (bulk-unpublish, future bulk-delete) so the
   * agent can relay "here's what just came down" without handing the editor a
   * dead link as if it were still live.
   */
  previouslyPublishedUrls?: string[];
  /**
   * Live public URLs the page resolves to after the bulk operation. Populated
   * by bulk-publish so the agent can show the editor what's now live.
   */
  publishedUrls?: string[];
}

export interface BulkOperationOutput {
  message: string;
  results: BulkResult[];
  successCount: number;
  failureCount: number;
  skippedCount: number;
}

/**
 * Fetch page details for all IDs — names and current version IDs for rollback.
 */
export async function fetchBulkItemDetails(ids: string[]): Promise<BulkItemDetail[]> {
  const details = await Promise.all(
    ids.map(async (id): Promise<BulkItemDetail | null> => {
      try {
        const docResult = await chainCms("get-document-by-id", { id });
        if (!docResult.ok) return null;
        const doc = docResult.data;
        const name = doc.variants?.[0]?.name ?? "Unknown";
        const cultures: Array<string | null> = (doc.variants ?? []).length
          ? doc.variants.map((v) => v.culture ?? null)
          : [null];

        const versionResult = await chainCms("get-document-version", {
          documentId: id, cursor: encodeCursor({ s: 0, t: 1 }),
        });
        const versionData: any = versionResult.ok ? versionResult.data : null;
        const currentVersionId = versionData?.items?.[0]?.id ?? "";

        return { id, name, currentVersionId, cultures };
      } catch {
        return null;
      }
    }),
  );

  return details.filter((d): d is BulkItemDetail => d !== null);
}

/**
 * Validate bulk IDs and return error output if invalid, null if OK.
 */
export function validateBulkIds(ids: string[]): BulkOperationOutput | null {
  if (ids.length === 0) {
    return {
      message: "No page IDs provided",
      results: [], successCount: 0, failureCount: 0, skippedCount: 0,
    };
  }
  if (ids.length > MAX_BULK_ITEMS) {
    return {
      message: `Too many items: ${ids.length} exceeds maximum of ${MAX_BULK_ITEMS}. Provide at most ${MAX_BULK_ITEMS} IDs per call.`,
      results: [], successCount: 0, failureCount: 0, skippedCount: 0,
    };
  }
  return null;
}

/**
 * Extract the ProblemDetails out of a chained CMS errorResult.
 *
 * chainCms now surfaces the ProblemDetails directly under `errorResult.structuredContent`
 * (single layer), so this just reads that. The legacy string path is kept for
 * callers that pass `content[0].text` (a JSON-serialized ProblemDetails) directly.
 *
 * @param err - The full errorResult object (preferred) or the content[0].text string.
 */
export function parseBulkError(err: unknown): unknown {
  if (err === null || err === undefined) return "Unknown error";

  if (typeof err === "object") {
    const asRecord = err as Record<string, unknown>;
    const sc = asRecord.structuredContent;
    if (sc !== null && sc !== undefined && typeof sc === "object") {
      return sc;
    }
    return err;
  }

  // Legacy path: caller passes content[0].text (a JSON string of the ProblemDetails).
  if (typeof err === "string") {
    try {
      const inner = JSON.parse(err);
      if (inner !== null && typeof inner === "object") {
        return inner;
      }
    } catch {
      // Not JSON — return as-is.
    }
  }

  return err;
}

/**
 * Execute a bulk operation sequentially. Stops on first failure.
 *
 * @param items - Page details from fetchBulkItemDetails
 * @param executeFn - Return null on success, error value on failure (string or parsed object)
 */
export async function executeBulkSequentially(
  items: BulkItemDetail[],
  executeFn: (item: BulkItemDetail) => Promise<unknown>,
): Promise<BulkResult[]> {
  const results: BulkResult[] = [];
  let stopped = false;

  for (const item of items) {
    if (stopped) {
      results.push({
        id: item.id, name: item.name, success: false,
        previousVersionId: item.currentVersionId || undefined,
        error: SKIPPED_SENTINEL,
      });
      continue;
    }

    const rawError = await executeFn(item);
    if (rawError) {
      results.push({
        id: item.id, name: item.name, success: false,
        previousVersionId: item.currentVersionId || undefined,
        error: parseBulkError(rawError),
      });
      stopped = true;
    } else {
      results.push({
        id: item.id, name: item.name, success: true,
        previousVersionId: item.currentVersionId || undefined,
      });
    }
  }

  return results;
}

/**
 * Build summary output from per-item results.
 */
export function buildBulkOutput(actionVerb: string, results: BulkResult[]): BulkOperationOutput {
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success && r.error !== SKIPPED_SENTINEL).length;
  const skippedCount = results.filter(r => r.error === SKIPPED_SENTINEL).length;

  return {
    message: `${actionVerb} ${successCount} of ${results.length} pages`,
    results, successCount, failureCount, skippedCount,
  };
}
