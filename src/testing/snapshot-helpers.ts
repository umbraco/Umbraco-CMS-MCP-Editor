/**
 * Extended snapshot helpers for editor MCP tools.
 *
 * The SDK's createSnapshotResult normalizes standard date fields (createDate, updateDate, etc.)
 * but editor tools use additional fields like `lastModified` that also need normalization.
 * This helper also normalizes all UUIDs in nested property values (e.g. block list content
 * with mediaKey, key, contentTypeKey) so snapshots are stable across Umbraco instances.
 */

import { createSnapshotResult } from "@umbraco-cms/mcp-server-sdk/testing";

const NORMALIZED_DATE = "NORMALIZED_DATE";
const NORMALIZED_UUID = "00000000-0000-0000-0000-000000000000";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Date fields used by editor MCP tools that the SDK doesn't normalize */
const EDITOR_DATE_FIELDS = ["lastModified"];

/** Fields known to contain UUIDs in nested content (block lists, media pickers, etc.) */
const UUID_FIELDS = ["key", "mediaKey", "contentTypeKey"];

function normalizeEditorFields(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(normalizeEditorFields);
  if (typeof obj !== "object") return obj;

  const normalized = { ...obj };

  for (const field of EDITOR_DATE_FIELDS) {
    if (normalized[field] && typeof normalized[field] === "string") {
      normalized[field] = NORMALIZED_DATE;
    }
  }

  for (const field of UUID_FIELDS) {
    if (normalized[field] && typeof normalized[field] === "string" && UUID_REGEX.test(normalized[field])) {
      normalized[field] = NORMALIZED_UUID;
    }
  }

  for (const key of Object.keys(normalized)) {
    if (typeof normalized[key] === "object" && normalized[key] !== null) {
      normalized[key] = normalizeEditorFields(normalized[key]);
    }
  }

  return normalized;
}

/**
 * Extended createSnapshotResult that also normalizes editor-specific date fields
 * and nested UUIDs in property values.
 * Use this instead of the SDK's createSnapshotResult in editor MCP tests.
 */
export function createEditorSnapshotResult(result: any, idToReplace?: string): any {
  const sdkNormalized = createSnapshotResult(result, idToReplace);

  if (sdkNormalized?.structuredContent) {
    sdkNormalized.structuredContent = normalizeEditorFields(sdkNormalized.structuredContent);
  }

  return sdkNormalized;
}
