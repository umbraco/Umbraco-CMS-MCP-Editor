# Phase 5: Bulk Operations — Design Spec

## Overview

Add safe bulk content operations to the editor MCP. One collection, 5 tools — all with strong safeguards to prevent accidental damage.

## Safety Model

Bulk operations with an LLM are inherently risky. Every tool in this phase follows these rules:

1. **Hard cap of 10 items per call** — reject before any API calls if `ids.length > 10`
2. **Explicit IDs only** — no "all pages matching X" wildcards. The LLM must resolve page IDs first using existing tools (list-children, search-content, etc.)
3. **Elicitation shows every item** — confirmation message lists every page name so the editor can review the full list
4. **Sequential execution** — items are processed one at a time. If one fails, remaining items are skipped and reported as not attempted
5. **Per-item results** — output shows success/failure for each item, making partial failures visible
6. **Destructive operations default unchecked** — unpublish and move default to `false` in the confirmation checkbox

## Collection

### `bulk-operations` (5 tools)

| Tool | Purpose | destructiveHint | defaultValue | Slices |
|------|---------|-----------------|-------------|--------|
| `bulk-publish` | Publish multiple pages | false | true (checked) | `publish` |
| `bulk-unpublish` | Take multiple pages offline | true | false (unchecked) | `publish` |
| `bulk-schedule-publish` | Set future publish dates | false | true (checked) | `publish` |
| `bulk-set-property` | Set same property value on multiple pages | false | true (checked) | `update` |
| `bulk-move` | Move multiple pages to a new parent | true | false (unchecked) | `move` |

## Tool Design Details

### Shared input pattern

All tools accept an `ids` array:
```typescript
ids: z.array(z.string().uuid()).min(1).max(10).describe("Page IDs to operate on (max 10)")
```

The handler validates length and returns an error if > 10 before doing anything.

### Shared output pattern

All tools return per-item results:
```typescript
{
  message: string,           // Summary: "Published 3 of 3 pages"
  results: [{
    id: string,
    name: string,
    success: boolean,
    error?: string,          // Only present on failure
  }],
  successCount: number,
  failureCount: number,
  skippedCount: number,      // Items not attempted after a failure
}
```

### Shared handler pattern

1. Validate `ids.length <= 10`
2. Fetch all page names in parallel for the confirmation message
3. Build confirmation message listing every page name
4. Call `confirmAction(extra, message, { title, defaultValue })`
5. If confirmed, process items sequentially — stop on first failure
6. Return per-item results

### `bulk-publish`

- Input: `ids` (uuid[], max 10), `includeDescendants` (boolean, optional, default false)
- Confirmation: "Publish these 3 pages?\n- Home\n- About Us\n- Contact"
- For each page: call `mcpClientManager.callTool("cms", "publish-document", { id, data: { publishSchedules: [] } })`
- If `includeDescendants`: use `publish-document-with-descendants` instead
- Annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- Description: "Publish multiple pages at once (max 10). Lists all page names for confirmation. Use search-content or list-children to find page IDs first."

### `bulk-unpublish`

- Input: `ids` (uuid[], max 10)
- Confirmation: "Unpublish these 3 pages? They will be taken offline.\n- Home\n- About Us\n- Contact"
- For each page: fetch document to get cultures, then call `mcpClientManager.callTool("cms", "unpublish-document", { id, data: { cultures } })`
- Annotations: `{ readOnlyHint: false, destructiveHint: true, idempotentHint: false }`
- Description: "Take multiple pages offline at once (max 10). Pages will remain as drafts. Lists all page names for confirmation."

### `bulk-schedule-publish`

- Input: `ids` (uuid[], max 10), `publishDate` (string, ISO 8601 date/time)
- Confirmation: "Schedule these 3 pages to publish on 2026-04-10 at 09:00?\n- Home\n- About Us\n- Contact"
- For each page: call `mcpClientManager.callTool("cms", "publish-document", { id, data: { publishSchedules: [{ culture: null, schedule: publishDate }] } })`
- Annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- Description: "Schedule multiple pages to publish at a future date (max 10). Provide the date in ISO 8601 format. Lists all page names and the scheduled date for confirmation."

### `bulk-set-property`

- Input: `ids` (uuid[], max 10), `alias` (string, property alias), `value` (any, property value), `culture` (string, optional), `segment` (string, optional)
- Confirmation: "Set 'heroHeader' to 'Welcome' on these 3 pages?\n- Home\n- About Us\n- Contact"
- For each page: call `mcpClientManager.callTool("cms", "update-document-properties", { id, values: [{ alias, value, culture, segment }] })`
- Annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- Description: "Set the same property value on multiple pages at once (max 10). Call get-page first to verify the property alias exists. Lists all page names and the property change for confirmation."

### `bulk-move`

- Input: `ids` (uuid[], max 10), `targetParentId` (uuid)
- Confirmation message shows current AND target locations:
  "Move these 3 pages to 'Blog'?\n- Home (currently at root)\n- About Us (currently under 'Company')\n- Contact (currently under 'Company')"
- For each page: fetch current parent name for the confirmation, then call `mcpClientManager.callTool("cms", "move-document", { id, target: { id: targetParentId } })`
- Annotations: `{ readOnlyHint: false, destructiveHint: true, idempotentHint: false }`
- Description: "Move multiple pages to a new parent location (max 10). Shows each page's current and target location for confirmation. Restructuring the site tree is hard to undo — review the list carefully."

## Mode Registry

New mode:
- `bulk-operations` — includes `bulk-operations` collection

## Worker Configuration

No changes needed.

## Testing

### Integration tests (using integration-test-creator agent)
- `bulk-operations/__tests__/` — test each tool with 1-2 items (not 10 — keep tests fast)
- Test the 10-item cap validation (pass 11 IDs, expect error)
- Elicitation accept/reject for all 5 tools
- Partial failure handling (pass one valid + one invalid ID)

### Eval tests (using eval-test-creator agent)
- "Publish the homepage and about page together" — requires bulk-publish
- "Take these three blog posts offline" — requires bulk-unpublish
- "Schedule the homepage and contact page to publish next Monday" — requires bulk-schedule-publish
- "Set the heroHeader to 'Welcome' on all root-level pages" — requires list-children + bulk-set-property
- "Move these three pages under the Blog section" — requires bulk-move

## File Structure

```
src/umbraco-api/tools/
  bulk-operations/
    index.ts
    post/
      bulk-publish.ts
      bulk-unpublish.ts
      bulk-schedule-publish.ts
      bulk-set-property.ts
      bulk-move.ts
    __tests__/
      bulk-operations.test.ts
```

## Success Criteria

- 5 new tools registered and working in both stdio and hosted modes
- Hard 10-item cap enforced on all tools
- Elicitation confirmation lists every page name
- Sequential execution with per-item results
- Destructive operations default unchecked
- Integration and eval tests pass
- Total tool count: 61 (56 existing + 5 new)
