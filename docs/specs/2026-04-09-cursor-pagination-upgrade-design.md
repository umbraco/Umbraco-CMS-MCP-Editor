# Cursor Pagination Upgrade

Upgrade `@umbraco-cms/mcp-dev` to 17.3.0 and `@umbraco-cms/mcp-server-sdk` / `@umbraco-cms/mcp-hosted` to 17.0.0-beta.11. These versions introduce cursor-based pagination across all MCP tool interfaces.

## Background

`mcp-dev@17.3.0` applies `withCursorPagination` to every tool that has `skip`/`take` parameters at server registration time. This means:

- CMS tools now accept an optional `cursor` string instead of `skip`/`take`
- Responses include `nextCursor` (string or null) indicating whether more pages exist
- The cursor is an opaque base64url-encoded token — agents never interpret it, just pass it back
- Omitting `cursor` returns the first page at the tool's default page size

The `withCursorPagination` decorator is also exported from `@umbraco-cms/mcp-server-sdk` so we can apply it to our own editor tools, keeping a consistent cursor-based model at every MCP interface boundary.

## Design Principle

**Every MCP interface an agent touches must be cursor-based.** No `skip`/`take` parameters exposed to any agent at any boundary.

Internally, tool handler code may still use `skip`/`take` — the `withCursorPagination` decorator translates `cursor` into `skip`/`take` before calling the handler. This is an implementation detail invisible to agents.

## Package Upgrades

| Package | Current | Target |
|---------|---------|--------|
| `@umbraco-cms/mcp-dev` | ^17.2.2 | ^17.3.0 |
| `@umbraco-cms/mcp-server-sdk` | ^17.0.0-beta.9 | ^17.0.0-beta.11 |
| `@umbraco-cms/mcp-hosted` | ^17.0.0-beta.9 | ^17.0.0-beta.11 |

## Changes Required

### 1. Editor Tool Registration — Apply `withCursorPagination`

`withStandardDecorators` in the updated SDK now includes `withCursorPagination` in its compose chain. Since every tool already does `export default withStandardDecorators(tool)`, cursor pagination is applied automatically at tool definition time. No changes needed to `index.ts`, `collections.ts`, or `worker.ts` — all entry points get cursor-paginated tools for free.

Tools without `skip`/`take` pass through unchanged — the decorator is a no-op for them.

**Affected tools (13 with skip/take in inputSchema):**
- `list-children`, `list-document-types`, `search-content`
- `list-media-children`, `search-media`, `list-media-types`
- `list-languages`, `list-dictionary`, `list-tags`
- `list-blueprints`, `search-members`, `list-member-types`
- `list-member-groups`, `list-redirects`, `list-versions`

### 2. Chained CMS Calls — Switch to Cursor

All `mcpClientManager.callTool("cms", ...)` calls that currently pass `skip`/`take` must switch to `cursor`. The SDK exports `encodeCursor` for cases where we need a specific skip/take encoded as a cursor.

#### 2a. Direct Pass-Through Tools

Tools like `list-children` that pass user-provided `skip`/`take` to chained CMS tools. Since the decorator now gives the handler `skip`/`take` from the decoded cursor, we need to re-encode these for the chained call.

**Approach:** Use `encodeCursor({ s: skip, t: take })` when calling chained tools. For first-page calls (skip=0), omit cursor to use defaults.

```typescript
import { encodeCursor } from "@umbraco-cms/mcp-server-sdk";

handler: async ({ parentId, take, skip }) => {
  const args: Record<string, unknown> = {};
  if (parentId) args.parentId = parentId;
  // Re-encode skip/take as cursor for the chained call
  if (skip > 0 || take !== undefined) {
    args.cursor = encodeCursor({ s: skip ?? 0, t: take ?? 20 });
  }
  const result = await mcpClientManager.callTool("cms", toolName, args);
  // ...
}
```

#### 2b. Tree Walker (`helpers/tree-walker.ts`)

Currently calls `get-tree-document-children` and `get-tree-document-root` with `{ take: scanLimit, skip: 0 }`.

**Approach:** Encode cursor for first page with desired page size, then follow `nextCursor` until limit reached or no more pages.

```typescript
async function fetchTreePage(toolName: string, args: Record<string, unknown>, cursor?: string) {
  const callArgs = { ...args };
  if (cursor) callArgs.cursor = cursor;
  return mcpClientManager.callTool("cms", toolName, callArgs);
}

// Loop: collect items until scanLimit or no nextCursor
let allItems = [];
let cursor = encodeCursor({ s: 0, t: Math.min(scanLimit, 100) });
while (allItems.length < scanLimit) {
  const result = await fetchTreePage(toolName, baseArgs, cursor);
  const data = extractChainedResult(result);
  allItems.push(...(data.items ?? []));
  if (!data.nextCursor) break;
  cursor = data.nextCursor;
}
```

#### 2c. Loop-Based Pagination (Member Reporting)

`report-member-count` and `report-member-activity` currently loop with incrementing `skip` calling `find-member`. Switch to following `nextCursor`.

```typescript
let allMembers = [];
let cursor: string | undefined;
while (allMembers.length < MEMBER_CAP) {
  const args: Record<string, unknown> = {};
  if (cursor) args.cursor = cursor;
  else args.cursor = encodeCursor({ s: 0, t: PAGE_SIZE });
  const result = await mcpClientManager.callTool("cms", "find-member", args);
  const data = extractChainedResult(result);
  allMembers.push(...(data.items ?? []));
  if (!data.nextCursor) break;
  cursor = data.nextCursor;
}
```

#### 2d. Bulk Handler (`helpers/bulk-handler.ts`)

Calls `get-document-version` with `{ documentId: id, take: 1, skip: 0 }`. Switch to cursor.

```typescript
args.cursor = encodeCursor({ s: 0, t: 1 });
```

#### 2e. Report Tools with Hardcoded skip/take

Several reporting tools call CMS tree tools with hardcoded `{ take: 100, skip: 0 }`:
- `report-deep-pages`, `list-untranslated`, `report-site-tree-summary`
- `bulk-set-block-property`

All need to switch to `encodeCursor({ s: 0, t: 100 })` or use cursor-based looping via tree walker.

### 3. Output Schema Updates

Tools that currently return `total` from CMS pagination responses should add `nextCursor` to their output schemas. The `withCursorPagination` decorator handles this for tools with skip/take, but tools that manually build list responses may need manual adjustment.

For tools wrapped by the decorator: the decorator automatically adds `nextCursor` to the output schema and response. No manual work needed.

For report tools (no skip/take, client-side pagination): these return complete result sets, so no cursor needed in output.

### 4. Test Updates

#### Integration Tests
- Tests that call tools with `skip`/`take` parameters need to switch to `cursor`
- Tests checking response shape need to expect `nextCursor` instead of relying on `total` for pagination
- Snapshot tests may need updating for changed response shapes

#### Eval Tests  
- Eval scenarios that test pagination workflows need updating
- `allTools` arrays already have all tools — no additions needed unless tool names change (they don't)

## What Does NOT Change

- Tool names — all stay the same
- Tool descriptions — may need minor updates to mention cursor instead of skip/take
- Handler internal logic — still receives skip/take from the decorator
- Non-paginated tools — unaffected
- Report tools that return complete datasets — no pagination interface change needed (they have no skip/take)

## Risks

- **SDK beta version**: `mcp-server-sdk@17.0.0-beta.11` is pre-release. API could shift, but `withCursorPagination` is stable (already used in production by `mcp-dev@17.3.0`).
- **Chained call compatibility**: If any CMS tool doesn't follow the cursor pattern, calls will fail. Mitigated by the fact that `mcp-dev` applies the decorator uniformly.
- **Page size defaults**: CMS tools may have different default page sizes than what we used with hardcoded `take` values. Using `encodeCursor` with explicit sizes preserves current behaviour.
