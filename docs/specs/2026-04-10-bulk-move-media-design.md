# bulk-move-media Design

**Date:** 2026-04-10
**Collection:** media-management

## Overview

Add a `bulk-move-media` tool to the `media-management` collection that moves up to 10 media items or folders to a destination folder in a single operation with confirmation.

## Motivation

The editor MCP has `move-media` (single item) and `bulk-move` (content pages), but no way to bulk-move media. Reorganising a media library often requires moving multiple items at once.

## Tool Definition

**Name:** `bulk-move-media`
**File:** `src/umbraco-api/tools/media-management/post/bulk-move-media.ts`
**Slices:** `["move"]`
**Annotations:** `{ readOnlyHint: false, destructiveHint: true, idempotentHint: false }`

### Input Schema

| Field | Type | Description |
|-------|------|-------------|
| `ids` | `z.array(z.string().uuid()).min(1).max(10)` | Media item or folder IDs to move (max 10) |
| `targetParentId` | `z.string().uuid()` | Destination folder ID |

### Output Schema

Standard `BulkOperationOutput` shape:

| Field | Type | Description |
|-------|------|-------------|
| `message` | `string` | Summary (e.g. "Moved 3 of 5 media items") |
| `results` | `array` | Per-item results with `id`, `name`, `success`, optional `error` |
| `successCount` | `number` | Items successfully moved |
| `failureCount` | `number` | Items that failed |
| `skippedCount` | `number` | Items skipped after a failure |

Note: No `previousVersionId` — media items don't have content versions for rollback.

## Handler Flow

1. **Validate** — `validateBulkIds(ids)` from bulk-handler (enforces 10-item cap)
2. **Fetch media names** — parallel `get-media-by-id` calls for all IDs
3. **Fetch target name** — `get-media-by-id` for the destination folder
4. **Confirm** — `confirmAction` listing all item names and destination
5. **Execute** — `executeBulkSequentially` calling CMS `move-media` for each item
6. **Return** — `buildBulkOutput("Moved", results)` with adjusted message ("media items" not "pages")

## Reuse from bulk-handler

- `validateBulkIds` — reuse directly
- `executeBulkSequentially` — reuse directly
- `buildBulkOutput` — reuse, but override the message to say "media items" instead of "pages"
- `fetchBulkItemDetails` — NOT reused (it's document-specific). Inline a simple media fetch loop instead.

## Collection Registration

Add `bulkMoveMediaTool` to `media-management/index.ts` tools array.

## Testing

- Integration test in `media-management/__tests__/bulk-move-media.test.ts`
- Eval test scenario added to existing media eval file

## Description (LLM-facing)

"Move multiple media items or folders to a different folder (max 10). Lists each item name and destination for confirmation before moving. Sequential execution stops on first failure."
