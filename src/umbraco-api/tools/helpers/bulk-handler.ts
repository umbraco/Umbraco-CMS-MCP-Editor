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
 * Extract problem-details from a chained CMS call error.
 *
 * chainCms wraps the raw CMS MCP result in a second createToolResultError call:
 *
 *   errorResult = createToolResultError(rawCmsResult)
 *   errorResult.structuredContent = rawCmsResult
 *   errorResult.structuredContent.structuredContent = <problem-details>
 *   errorResult.content[0].text = JSON.stringify(rawCmsResult)  [compat mode only]
 *
 * Structured-only mode (used in tests) omits content[0].text, so we cannot rely
 * on it. Instead, drill into structuredContent twice. Falls back to content[0].text
 * for callers that pass the text string directly (legacy path).
 *
 * @param err - The full errorResult object (preferred) or the content[0].text string.
 */
export function parseBulkError(err: unknown): unknown {
  if (err === null || err === undefined) return "Unknown error";

  // Preferred path: caller passes the full errorResult object.
  // Drill through two layers of createToolResultError wrapping to reach problem-details.
  if (typeof err === "object") {
    const asRecord = err as Record<string, unknown>;
    // Layer 1: errorResult.structuredContent = rawCmsResult
    const layer1 = asRecord.structuredContent;
    if (layer1 !== null && layer1 !== undefined && typeof layer1 === "object") {
      const layer1Rec = layer1 as Record<string, unknown>;
      // Layer 2: rawCmsResult.structuredContent = problem-details
      if (layer1Rec.structuredContent !== null && layer1Rec.structuredContent !== undefined) {
        return layer1Rec.structuredContent;
      }
      // rawCmsResult has content[0].text = JSON.stringify(problem-details)
      const inner = layer1Rec.content;
      if (Array.isArray(inner) && inner[0]?.text) {
        try {
          return JSON.parse(inner[0].text as string);
        } catch { /* fall through */ }
      }
      return layer1;
    }
    return err;
  }

  // Legacy path: caller passes content[0].text (a JSON string of rawCmsResult).
  if (typeof err === "string") {
    try {
      const inner = JSON.parse(err);
      if (inner !== null && typeof inner === "object") {
        const innerRec = inner as Record<string, unknown>;
        if (innerRec.structuredContent !== undefined) return innerRec.structuredContent;
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
