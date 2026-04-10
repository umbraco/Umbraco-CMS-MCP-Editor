# bulk-set-block-property Design

## Problem

We have `edit-block` for updating properties on a single block and `bulk-set-property` for updating top-level page properties across multiple pages. There is no tool to bulk update block properties across pages — e.g., changing a CTA button URL on every page's hero block, or updating a shared disclaimer text block across the site.

## Solution

A new tool `bulk-set-block-property` that targets blocks by element type across a set of pages and updates specified properties on all matching blocks.

## Input Schema

```typescript
ids: z.array(z.string().uuid()).min(1).max(10)  // Page IDs
contentTypeKey: z.string().uuid()                // Block element type to match
propertyAlias: z.string()                        // Block-containing property (e.g., "contentRows")
values: z.array(z.object({                       // Fields to update on matching blocks
  alias: z.string(),
  value: z.any(),
})).min(1)
culture: z.string().nullable().optional()
segment: z.string().nullable().optional()
```

### How the LLM discovers the inputs

1. `inspect-blocks` on a sample page reveals `propertyAlias`, `contentTypeKey`, and block property aliases
2. `search-content` or `list-children` provides page IDs
3. The LLM combines these to call `bulk-set-block-property`

## Handler Flow

1. **Validate** — check IDs array within 10-item cap (reuse bulk-handler validation)
2. **Fetch & inspect** — for each page:
   - `get-document-by-id` to get page name and content
   - Use inspect-blocks detection logic to find blocks matching `contentTypeKey` within the specified `propertyAlias`
   - Track page name, matching block contentKeys, and current version ID
3. **Confirm** — elicit confirmation with summary:
   - "Update {n} field(s) on {blockCount} block(s) across {pageCount} page(s)"
   - List page names
   - List field aliases being changed
   - Note: "Changes will be saved but not published"
   - `defaultValue: true` (non-destructive, idempotent)
4. **Execute** — sequential per page, fail-fast:
   - Call `update-block-property` with all matching block keys for that page in one call
   - Each block gets the same `values` array applied
   - On failure, skip remaining pages
5. **Return** — structured summary

## Output Schema

```typescript
{
  message: string
  results: z.array(z.object({
    id: z.string(),
    name: z.string(),
    success: z.boolean(),
    blocksUpdated: z.number(),
    previousVersionId: z.string().optional(),
    error: z.string().optional(),
  }))
  successCount: z.number()
  failureCount: z.number()
  skippedCount: z.number()
  totalBlocksUpdated: z.number()
}
```

## Tool Metadata

- **Name:** `bulk-set-block-property`
- **Slices:** `["update"]`
- **Annotations:** `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true`
- **File:** `src/umbraco-api/tools/bulk-operations/post/bulk-set-block-property.ts`
- **Collection:** registered in `src/umbraco-api/tools/bulk-operations/index.ts`

## Patterns Reused

- **bulk-handler:** validation, sequential fail-fast execution, result aggregation
- **edit-block:** `update-block-property` chained call for the actual mutation, `values` array shape
- **inspect-blocks:** block detection logic (BlockList/BlockGrid and Rich Text with blocks)

## Edge Cases

- **No matching blocks on a page:** Page reported as success with `blocksUpdated: 0`
- **Property alias doesn't exist on page:** Page reported as success with `blocksUpdated: 0`
- **Multiple matching blocks on one page:** All matching blocks updated in a single API call
- **Block type exists but specified field alias doesn't:** Delegated to CMS API error handling

## Testing

- Integration test: create pages with blocks, bulk update a property, verify changes
- Eval test: LLM scenario — "change the caption on all image blocks across these pages"
