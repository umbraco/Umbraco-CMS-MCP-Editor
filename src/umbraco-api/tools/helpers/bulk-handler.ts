/**
 * Bulk Operation Handler
 *
 * Shared helper for bulk tools. Encapsulates the validate → fetch → confirm → execute flow
 * with 10-item hard cap, per-item confirmation, sequential execution, and rollback support.
 */

import { encodeCursor } from "@umbraco-cms/mcp-server-sdk";
import { chainCms } from "../../cms-chain.js";

const MAX_BULK_ITEMS = 10;

export interface BulkItemDetail {
  id: string;
  name: string;
  currentVersionId: string;
  extra?: Record<string, any>;
}

export interface BulkResult {
  id: string;
  name: string;
  success: boolean;
  previousVersionId?: string;
  error?: string;
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

        const versionResult = await chainCms("get-document-version", {
          documentId: id, cursor: encodeCursor({ s: 0, t: 1 }),
        });
        const versionData: any = versionResult.ok ? versionResult.data : null;
        const currentVersionId = versionData?.items?.[0]?.id ?? "";

        return { id, name, currentVersionId };
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
 * Execute a bulk operation sequentially. Stops on first failure.
 *
 * @param items - Page details from fetchBulkItemDetails
 * @param executeFn - Return null on success, error string on failure
 */
export async function executeBulkSequentially(
  items: BulkItemDetail[],
  executeFn: (item: BulkItemDetail) => Promise<string | null>,
): Promise<BulkResult[]> {
  const results: BulkResult[] = [];
  let stopped = false;

  for (const item of items) {
    if (stopped) {
      results.push({
        id: item.id, name: item.name, success: false,
        previousVersionId: item.currentVersionId || undefined,
        error: "Skipped — previous item failed",
      });
      continue;
    }

    const error = await executeFn(item);
    if (error) {
      results.push({
        id: item.id, name: item.name, success: false,
        previousVersionId: item.currentVersionId || undefined,
        error,
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
  const failureCount = results.filter(r => !r.success && r.error !== "Skipped — previous item failed").length;
  const skippedCount = results.filter(r => r.error === "Skipped — previous item failed").length;

  return {
    message: `${actionVerb} ${successCount} of ${results.length} pages`,
    results, successCount, failureCount, skippedCount,
  };
}
