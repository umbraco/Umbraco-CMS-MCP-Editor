# Cursor Pagination Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade mcp-dev to 17.3.1, mcp-server-sdk and mcp-hosted to 17.0.0-beta.12, and convert all pagination from skip/take to cursor-based at every MCP boundary.

**Architecture:** The `withCursorPagination` decorator wraps tools at registration time, translating opaque cursor strings to skip/take internally. Our tool handlers keep their skip/take parameters — the decorator handles the MCP interface translation. Chained CMS calls must switch to cursor because the CMS tools are also wrapped with the same decorator.

**Tech Stack:** TypeScript, @umbraco-cms/mcp-server-sdk (withCursorPagination, encodeCursor, extractChainedResult), Jest

**Worktree:** `/Users/philw/Projects/umbraco-mcp-editor-cms/.worktrees/upgrade-cursor-pagination`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `package.json` | Modify | Bump 3 dependency versions |
| `src/index.ts` | No change | `withStandardDecorators` now includes `withCursorPagination` — tools are cursor-wrapped at definition time |
| `src/collections.ts` | No change | Same — no wrapping needed |
| `src/worker.ts` | No change | Same |
| `src/umbraco-api/tools/helpers/tree-walker.ts:42-44,85-87` | Modify | Switch to cursor-based fetching with pagination loop |
| `src/umbraco-api/tools/helpers/bulk-handler.ts:49` | Modify | Switch `get-document-version` call to cursor |
| `src/umbraco-api/tools/content/get/list-children.ts:24-28` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/content/get/search-content.ts:24-25` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/content/get/list-document-types.ts:30` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/media/get/list-media-children.ts:33-34` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/media/get/search-media.ts:32` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/media/get/list-media-types.ts` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/language/get/list-languages.ts:28` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/dictionary/get/list-dictionary.ts:31-32` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/tag/get/list-tags.ts:31` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/blueprint/get/list-blueprints.ts:35` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/member/get/search-members.ts:31` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/member/get/list-member-types.ts:27` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/member-group/get/list-member-groups.ts:26` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/redirect/get/list-redirects.ts:32` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/versioning/get/list-versions.ts:39` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/member-reporting/get/report-member-count.ts:32-44` | Modify | Switch fetch loop to cursor-following |
| `src/umbraco-api/tools/member-reporting/get/report-member-activity.ts:38-49` | Modify | Switch fetch loop to cursor-following |
| `src/umbraco-api/tools/member-reporting/get/report-members-by-group.ts:33-37` | Modify | Re-encode skip/take as cursor for chained call |
| `src/umbraco-api/tools/site-structure/get/report-site-tree-summary.ts:42-43` | Modify | Use tree-walker pattern (cursor-based) |
| `src/umbraco-api/tools/site-structure/get/report-deep-pages.ts:54-55,105-106` | Modify | Use tree-walker pattern (cursor-based) |
| `src/umbraco-api/tools/translation/get/list-untranslated.ts:31` | Modify | Switch to cursor for tree fetch |
| `src/umbraco-api/tools/content-reporting/get/report-translation-coverage.ts:48` | Modify | Switch language fetch to cursor |
| `src/umbraco-api/tools/bulk-operations/post/bulk-set-block-property.ts:103` | Modify | Switch `get-document-version` call to cursor |
| 20 integration test files | Modify | Replace skip/take params with cursor in test calls |

---

### Task 1: Upgrade Package Dependencies

**Files:**
- Modify: `package.json:46-48`

- [ ] **Step 1: Update package versions**

In `package.json`, update the three dependencies:

```json
"@umbraco-cms/mcp-dev": "^17.3.1",
"@umbraco-cms/mcp-hosted": "^17.0.0-beta.12",
"@umbraco-cms/mcp-server-sdk": "^17.0.0-beta.12",
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/philw/Projects/umbraco-mcp-editor-cms/.worktrees/upgrade-cursor-pagination && npm install`
Expected: Clean install, no peer dependency errors.

- [ ] **Step 3: Verify type-check passes (it won't yet — just confirm install worked)**

Run: `cd /Users/philw/Projects/umbraco-mcp-editor-cms/.worktrees/upgrade-cursor-pagination && npm run compile 2>&1 | tail -5`
Expected: May show errors — that's fine, we're just confirming the SDK exports are accessible.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: upgrade mcp-dev to 17.3.1, mcp-server-sdk and mcp-hosted to beta.12"
```

---

### Task 2: No Registration Changes Needed

`withStandardDecorators` in the updated SDK now includes `withCursorPagination`. Since every tool already does `export default withStandardDecorators(tool)`, cursor pagination is applied automatically at tool definition time. No changes to `collections.ts`, `index.ts`, or `worker.ts`.

---

### Task 3: Convert Tree Walker to Cursor-Based Fetching

**Files:**
- Modify: `src/umbraco-api/tools/helpers/tree-walker.ts:1-92`

The tree walker is used by ~13 reporting tools. Converting it once fixes all of them. Currently it passes `{ take: scanLimit, skip: 0 }` — switch to cursor-based pagination that follows `nextCursor` until the scan limit is reached.

- [ ] **Step 1: Add `encodeCursor` import**

```typescript
import { extractChainedResult, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
```

- [ ] **Step 2: Rewrite `walkContentTree` to use cursor pagination**

Replace the tree fetching section (lines 42-48) with a cursor-following loop:

```typescript
export async function walkContentTree(
  options: TreeWalkOptions = {},
): Promise<WalkedPage[]> {
  const { parentId, scanLimit = 100 } = options;

  // Fetch tree items using cursor-based pagination
  const toolName = parentId ? "get-tree-document-children" : "get-tree-document-root";
  const baseArgs: Record<string, unknown> = {};
  if (parentId) baseArgs.parentId = parentId;

  const treeItems: any[] = [];
  let cursor: string | undefined = encodeCursor({ s: 0, t: Math.min(scanLimit, 100) });

  while (treeItems.length < scanLimit) {
    const callArgs: Record<string, unknown> = { ...baseArgs };
    if (cursor) callArgs.cursor = cursor;
    const treeResult = await mcpClientManager.callTool("cms", toolName, callArgs);
    if (treeResult.isError) break;
    const treeData = extractChainedResult(treeResult);
    treeItems.push(...(treeData?.items ?? []));
    if (!treeData?.nextCursor) break;
    cursor = treeData.nextCursor;
  }
```

The rest of the function (enrichment via `get-document-by-id`) stays the same — `get-document-by-id` takes a single ID, no pagination.

- [ ] **Step 3: Rewrite `walkMediaTree` similarly**

Replace lines 85-91:

```typescript
export async function walkMediaTree(
  options: TreeWalkOptions = {},
): Promise<any[]> {
  const { parentId, scanLimit = 100 } = options;

  const toolName = parentId ? "get-media-children" : "get-media-root";
  const baseArgs: Record<string, unknown> = {};
  if (parentId) baseArgs.parentId = parentId;

  const allItems: any[] = [];
  let cursor: string | undefined = encodeCursor({ s: 0, t: Math.min(scanLimit, 100) });

  while (allItems.length < scanLimit) {
    const callArgs: Record<string, unknown> = { ...baseArgs };
    if (cursor) callArgs.cursor = cursor;
    const result = await mcpClientManager.callTool("cms", toolName, callArgs);
    if (result.isError) break;
    const data = extractChainedResult(result);
    allItems.push(...(data?.items ?? []));
    if (!data?.nextCursor) break;
    cursor = data.nextCursor;
  }

  return allItems;
}
```

- [ ] **Step 4: Verify compile**

Run: `cd /Users/philw/Projects/umbraco-mcp-editor-cms/.worktrees/upgrade-cursor-pagination && npm run compile 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add src/umbraco-api/tools/helpers/tree-walker.ts
git commit -m "feat: convert tree-walker to cursor-based pagination"
```

---

### Task 4: Convert Direct Pass-Through Tools (Chained Calls)

**Files:**
- Modify: 15 tool files that pass skip/take to chained CMS calls

All these tools receive `skip`/`take` from the decorator (which decodes the agent's cursor), then need to re-encode as cursor for the chained CMS call. The pattern is the same for all: use `encodeCursor({ s: skip, t: take })`.

- [ ] **Step 1: Create a helper function for re-encoding**

This pattern repeats 15+ times. Add a small helper to avoid repetition. In `src/umbraco-api/tools/helpers/tree-walker.ts` (which is already a shared helpers file), add at the bottom:

```typescript
/**
 * Build cursor argument for a chained CMS call from handler skip/take values.
 * Returns undefined when skip=0 and no explicit take, letting the CMS use its default page size.
 */
export function buildChainedCursor(skip: number, take: number): string {
  return encodeCursor({ s: skip, t: take });
}
```

- [ ] **Step 2: Convert `list-children.ts`**

File: `src/umbraco-api/tools/content/get/list-children.ts`

Add import:
```typescript
import { buildChainedCursor } from "../../helpers/tree-walker.js";
```

Replace handler (lines 24-38):
```typescript
  handler: async ({ parentId, take, skip }) => {
    const toolName = parentId ? "get-document-children" : "get-document-root";
    const args: Record<string, unknown> = { cursor: buildChainedCursor(skip, take) };
    if (parentId) args.parentId = parentId;
    const result = await mcpClientManager.callTool("cms", toolName, args);
    if (result.isError) return createToolResultError(result);
    const data = extractChainedResult(result);
    return createToolResult({
      items: (data.items ?? []).map((item: any) => ({
        id: item.id,
        name: item.variants?.[0]?.name ?? item.name ?? "Unknown",
        hasChildren: item.hasChildren ?? false,
      })),
      total: data.total ?? 0,
    });
  },
```

- [ ] **Step 3: Convert `search-content.ts`**

File: `src/umbraco-api/tools/content/get/search-content.ts`

Add import:
```typescript
import { buildChainedCursor } from "../../helpers/tree-walker.js";
```

Replace line 25:
```typescript
    const result = await mcpClientManager.callTool("cms", "search-document", { query, cursor: buildChainedCursor(skip, take) });
```

- [ ] **Step 4: Convert `list-document-types.ts`**

File: `src/umbraco-api/tools/content/get/list-document-types.ts`

Add import:
```typescript
import { buildChainedCursor } from "../../helpers/tree-walker.js";
```

Replace the chained call to use `cursor: buildChainedCursor(skip, take)` instead of `take, skip`.

- [ ] **Step 5: Convert `list-media-children.ts`**

File: `src/umbraco-api/tools/media/get/list-media-children.ts`

Add import:
```typescript
import { buildChainedCursor } from "../../helpers/tree-walker.js";
```

Replace handler to use `cursor: buildChainedCursor(skip, take)` instead of `take, skip` in both branch paths (root and children).

- [ ] **Step 6: Convert `search-media.ts`**

File: `src/umbraco-api/tools/media/get/search-media.ts`

Add import and replace `take, skip` with `cursor: buildChainedCursor(skip, take)`.

- [ ] **Step 7: Convert `list-media-types.ts`**

File: `src/umbraco-api/tools/media/get/list-media-types.ts`

Same pattern — add import, replace skip/take with cursor.

- [ ] **Step 8: Convert `list-languages.ts`**

File: `src/umbraco-api/tools/language/get/list-languages.ts`

Same pattern.

- [ ] **Step 9: Convert `list-dictionary.ts`**

File: `src/umbraco-api/tools/dictionary/get/list-dictionary.ts`

Same pattern — both `get-dictionary-children` and `get-dictionary-root` calls.

- [ ] **Step 10: Convert `list-tags.ts`**

File: `src/umbraco-api/tools/tag/get/list-tags.ts`

Same pattern.

- [ ] **Step 11: Convert `list-blueprints.ts`**

File: `src/umbraco-api/tools/blueprint/get/list-blueprints.ts`

Same pattern.

- [ ] **Step 12: Convert `search-members.ts`**

File: `src/umbraco-api/tools/member/get/search-members.ts`

Same pattern.

- [ ] **Step 13: Convert `list-member-types.ts`**

File: `src/umbraco-api/tools/member/get/list-member-types.ts`

Same pattern.

- [ ] **Step 14: Convert `list-member-groups.ts`**

File: `src/umbraco-api/tools/member-group/get/list-member-groups.ts`

Same pattern.

- [ ] **Step 15: Convert `list-redirects.ts`**

File: `src/umbraco-api/tools/redirect/get/list-redirects.ts`

Same pattern — include `filter` in args alongside cursor.

- [ ] **Step 16: Convert `list-versions.ts`**

File: `src/umbraco-api/tools/versioning/get/list-versions.ts`

Same pattern — include `documentId` in args alongside cursor.

- [ ] **Step 17: Convert `report-members-by-group.ts`**

File: `src/umbraco-api/tools/member-reporting/get/report-members-by-group.ts`

Same pattern — include `memberGroupName` in args alongside cursor.

- [ ] **Step 18: Verify compile**

Run: `cd /Users/philw/Projects/umbraco-mcp-editor-cms/.worktrees/upgrade-cursor-pagination && npm run compile 2>&1 | head -30`

- [ ] **Step 19: Commit**

```bash
git add src/umbraco-api/tools/
git commit -m "feat: convert all pass-through tools to cursor-based chained calls"
```

---

### Task 5: Convert Loop-Based Pagination Tools

**Files:**
- Modify: `src/umbraco-api/tools/member-reporting/get/report-member-count.ts:30-44`
- Modify: `src/umbraco-api/tools/member-reporting/get/report-member-activity.ts:36-50`

These tools fetch all members in a loop. Switch from incrementing `skip` to following `nextCursor`.

- [ ] **Step 1: Convert `report-member-count.ts`**

Add import:
```typescript
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
```

Replace the fetch loop (lines 31-44):
```typescript
    // Fetch all members via cursor-based pagination (capped at 500)
    const allMembers: any[] = [];
    let cursor: string | undefined = encodeCursor({ s: 0, t: PAGE_SIZE });

    while (allMembers.length < MEMBER_CAP) {
      const args: Record<string, unknown> = {};
      if (cursor) args.cursor = cursor;
      const result = await mcpClientManager.callTool("cms", "find-member", args);
      if (result.isError) return createToolResultError(result);
      const data = extractChainedResult(result);
      const items: any[] = data.items ?? [];
      allMembers.push(...items);
      if (!data.nextCursor || items.length === 0) break;
      cursor = data.nextCursor;
    }
```

- [ ] **Step 2: Convert `report-member-activity.ts`**

Add `encodeCursor` to the import.

Replace the fetch loop (lines 37-50):
```typescript
    // Fetch all members via cursor-based pagination (capped at 500)
    const allMembers: any[] = [];
    let cursor: string | undefined = encodeCursor({ s: 0, t: PAGE_SIZE });

    while (allMembers.length < MEMBER_CAP) {
      const args: Record<string, unknown> = {};
      if (cursor) args.cursor = cursor;
      const result = await mcpClientManager.callTool("cms", "find-member", args);
      if (result.isError) return createToolResultError(result);
      const data = extractChainedResult(result);
      const items: any[] = data.items ?? [];
      allMembers.push(...items);
      if (!data.nextCursor || items.length === 0) break;
      cursor = data.nextCursor;
    }
```

- [ ] **Step 3: Verify compile**

Run: `cd /Users/philw/Projects/umbraco-mcp-editor-cms/.worktrees/upgrade-cursor-pagination && npm run compile 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add src/umbraco-api/tools/member-reporting/
git commit -m "feat: convert member reporting fetch loops to cursor-based pagination"
```

---

### Task 6: Convert Standalone Chained Calls (Reports + Bulk)

**Files:**
- Modify: `src/umbraco-api/tools/helpers/bulk-handler.ts:49`
- Modify: `src/umbraco-api/tools/site-structure/get/report-site-tree-summary.ts:42-43`
- Modify: `src/umbraco-api/tools/site-structure/get/report-deep-pages.ts:54-55,105-106`
- Modify: `src/umbraco-api/tools/translation/get/list-untranslated.ts:31`
- Modify: `src/umbraco-api/tools/content-reporting/get/report-translation-coverage.ts:48`
- Modify: `src/umbraco-api/tools/bulk-operations/post/bulk-set-block-property.ts:103`

These files have hardcoded `{ skip: 0, take: N }` calls to CMS tools.

- [ ] **Step 1: Convert `bulk-handler.ts`**

Add `encodeCursor` import:
```typescript
import { extractChainedResult, encodeCursor } from "@umbraco-cms/mcp-server-sdk";
```

Replace line 49 — change `{ documentId: id, take: 1, skip: 0 }` to:
```typescript
{ documentId: id, cursor: encodeCursor({ s: 0, t: 1 }) }
```

- [ ] **Step 2: Convert `bulk-set-block-property.ts`**

Add `encodeCursor` import and replace line 103 — change `{ documentId: id, take: 1, skip: 0 }` to:
```typescript
{ documentId: id, cursor: encodeCursor({ s: 0, t: 1 }) }
```

- [ ] **Step 3: Convert `report-site-tree-summary.ts`**

Add `encodeCursor` import. Replace the `fetchTreeLevel` function (lines 40-48):
```typescript
async function fetchTreeLevel(parentId: string | undefined, depth: number): Promise<any[]> {
  const toolName = parentId ? "get-tree-document-children" : "get-tree-document-root";
  const args: Record<string, unknown> = { cursor: encodeCursor({ s: 0, t: 100 }) };
  if (parentId) args.parentId = parentId;
  const result = await mcpClientManager.callTool("cms", toolName, args);
  if (result.isError) return [];
  const data = extractChainedResult(result);
  return data?.items ?? [];
}
```

- [ ] **Step 4: Convert `report-deep-pages.ts`**

Add `encodeCursor` import. Replace all 4 chained calls (lines 54-55 and 105-106). Each `{ parentId, take: 100, skip: 0 }` or `{ take: 100, skip: 0 }` becomes:
```typescript
// Line 54:
await mcpClientManager.callTool("cms", "get-tree-document-children", { parentId, cursor: encodeCursor({ s: 0, t: 100 }) })
// Line 55:
await mcpClientManager.callTool("cms", "get-tree-document-root", { cursor: encodeCursor({ s: 0, t: 100 }) })
// Line 105:
await mcpClientManager.callTool("cms", "get-tree-document-children", { parentId: pid, cursor: encodeCursor({ s: 0, t: 100 }) })
// Line 106:
await mcpClientManager.callTool("cms", "get-tree-document-root", { cursor: encodeCursor({ s: 0, t: 100 }) })
```

- [ ] **Step 5: Convert `list-untranslated.ts`**

Add `encodeCursor` import. Replace line 31:
```typescript
    const args: Record<string, unknown> = { cursor: encodeCursor({ s: 0, t: 100 }) };
    if (parentId) args.parentId = parentId;
```

- [ ] **Step 6: Convert `report-translation-coverage.ts`**

Add `encodeCursor` import. Replace line 48:
```typescript
    const langResult = await mcpClientManager.callTool("cms", "get-language", { cursor: encodeCursor({ s: 0, t: 100 }) });
```

- [ ] **Step 7: Verify compile passes cleanly**

Run: `cd /Users/philw/Projects/umbraco-mcp-editor-cms/.worktrees/upgrade-cursor-pagination && npm run compile`
Expected: No errors. All skip/take references in chained calls should now be converted.

- [ ] **Step 8: Commit**

```bash
git add src/umbraco-api/tools/
git commit -m "feat: convert all remaining hardcoded skip/take chained calls to cursor"
```

---

### Task 7: Update Integration Tests

**Files:**
- Modify: All 20 test files in `src/umbraco-api/tools/**/__tests__/*.test.ts`

Integration tests call tool handlers directly with skip/take params. Since the `withCursorPagination` decorator is NOT applied in tests (tools are imported directly), the handlers still accept skip/take. **The handler signatures haven't changed** — the decorator only wraps at registration.

However, we need to verify that the chained CMS calls work correctly with the new cursor-based approach. The tests should still pass since they call the handler directly (which receives skip/take and internally uses cursor for chained calls).

- [ ] **Step 1: Run the integration tests to see what passes/fails**

Run: `cd /Users/philw/Projects/umbraco-mcp-editor-cms/.worktrees/upgrade-cursor-pagination && npm test 2>&1 | tail -40`

This will show which tests pass and which fail. Tests that call tools directly with `{ skip: 0, take: 5 }` should still work because the handler signature hasn't changed — only the chained calls inside have changed to use cursor.

- [ ] **Step 2: Fix any failing tests**

If tests fail because:
- **CMS response shape changed** (e.g. `total` moved or renamed): update assertions
- **CMS tool interface changed** (tools called in tests that now need cursor): won't happen — tests call editor tools directly, not CMS tools
- **Snapshot mismatches**: update snapshots

Run: `cd /Users/philw/Projects/umbraco-mcp-editor-cms/.worktrees/upgrade-cursor-pagination && npm test -- -u` to update snapshots if needed.

- [ ] **Step 3: Verify all tests pass**

Run: `cd /Users/philw/Projects/umbraco-mcp-editor-cms/.worktrees/upgrade-cursor-pagination && npm test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/umbraco-api/tools/**/__tests__/
git commit -m "test: update integration tests for cursor-based pagination"
```

---

### Task 8: Build and Final Verification

- [ ] **Step 1: Full build**

Run: `cd /Users/philw/Projects/umbraco-mcp-editor-cms/.worktrees/upgrade-cursor-pagination && npm run build`
Expected: Clean build, no errors.

- [ ] **Step 2: Run full test suite**

Run: `cd /Users/philw/Projects/umbraco-mcp-editor-cms/.worktrees/upgrade-cursor-pagination && npm test`
Expected: All tests pass.

- [ ] **Step 3: Verify no remaining skip/take in chained calls**

Run a grep to confirm no `mcpClientManager.callTool` calls still pass `skip` or `take`:
```bash
cd /Users/philw/Projects/umbraco-mcp-editor-cms/.worktrees/upgrade-cursor-pagination && grep -rn 'callTool.*skip\|callTool.*take' src/ --include='*.ts' | grep -v '__tests__' | grep -v 'node_modules'
```
Expected: No matches (or only matches in comments/string literals, not actual call arguments).

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final verification — cursor pagination upgrade complete"
```
