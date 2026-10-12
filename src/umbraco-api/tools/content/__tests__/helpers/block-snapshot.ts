import { createEditorSnapshotResult } from "../../../../../testing/snapshot-helpers.js";

const NORMALIZED_BLOCK_KEY = "<block-content-key>";

/**
 * Snapshot helper for block write tools. Normalises the page id (via the editor
 * snapshot helper) and the per-run block contentKey wherever it appears, including
 * inside message text.
 */
export function createBlockSnapshotResult(result: any, pageId: string, blockKey?: string): any {
  const snapshot = createEditorSnapshotResult(result, pageId);
  const key = blockKey ?? result?.structuredContent?.contentKey;
  if (!key || typeof key !== "string") return snapshot;
  return JSON.parse(JSON.stringify(snapshot).split(key).join(NORMALIZED_BLOCK_KEY));
}
