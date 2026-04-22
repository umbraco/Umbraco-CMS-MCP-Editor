# Recycle Bin Operations

## Problem

The Umbraco UI has a **Recycle Bin** in both the Content and Media sections. Items trashed via the Umbraco UI's "Trash…" entity action land there and can be **Restored**, **Permanently deleted**, or the whole bin can be **Emptied**.

Our tools partially cover this. Gaps to close:

- **List bin contents** — not possible today
- **Permanently delete one item** — not possible today
- **Empty the bin** — not possible today

## UI Workflow (Reproduction Steps)

### Content Recycle Bin
1. Navigate to Content section
2. Click **"Recycle Bin"** in the tree (below all content)
3. See all trashed content items
4. Right-click a trashed item for: **Restore** / **Delete permanently**
5. Or right-click the bin itself for **Empty recycle bin**

### Media Recycle Bin
Same flow under the Media section.

## Proposed Tools

### `list-recycle-bin` (read)
**Input:**
- `type` ("content" | "media")
- `parentId` (uuid, optional) — when omitted, list the bin root; when given, list the children of that trashed folder
- `cursor` (string, optional) — opaque pagination cursor (per the project's cursor-pagination convention; `withCursorPagination` decorator handles translation to/from skip/take at the MCP boundary)

**Output:** trashed items with `name`, `originalParentId`, `trashedAt`, `trashedBy`, `hasChildren: boolean`, `childCount: number`

The recycle bin is a tree, not a flat list — when a folder (or any node with children) is trashed the whole branch moves in together, so you can have trashed folders that contain trashed children. The tool returns one level at a time and the agent drills in by re-calling with `parentId`.

Chains to:
- content → `get-recycle-bin-document-root` (when `parentId` omitted) / `get-recycle-bin-document-children` (when `parentId` given)
- media → `get-recycle-bin-media-root` / `get-recycle-bin-media-children`

Paginated only — **do not walk** nested trashed folders server-side. Return one level per call.

### `permanent-delete-recycle-bin-item` (destructive, irreversible)
**Input:**
- `id` (uuid) — trashed item ID
- `type` ("content" | "media")

Chains to `delete-from-recycle-bin` / `delete-media-from-recycle-bin`.

**Folder blast radius:** deleting a trashed folder deletes its entire subtree. Before confirming, the tool must chain `list-recycle-bin` against that `id` (and recursively, capped at a reasonable depth/count — say 50 items) to produce a preview count and name sample for the elicitation. If the item has no children, the preview is a single line. If the subtree exceeds the cap, say "…and N more descendants" and err on the side of alarming, not reassuring.

### `empty-recycle-bin` (destructive, irreversible, bulk)
**Input:**
- `type` ("content" | "media")

Chains to `empty-recycle-bin` / `empty-media-recycle-bin`.

**Scope:** this clears **the entire bin**, including every nested descendant of every trashed folder — not just the top-level items. The elicitation must say so explicitly ("Empty the entire recycle bin? This will permanently delete N items including contents of any trashed folders."), not just give a top-level count that understates what's about to go.

## Safety: Strong Elicitation for Irreversible Ops

Permanent delete and empty-recycle-bin cannot be undone — the data is gone. They need stronger confirmation than the standard `confirmAction` prompt the rest of the destructive tools use.

**Requirements:**

1. **Always elicit — no opt-out.** Do not honour any "skip confirmation" env var or flag. These are the two operations where a mis-fired tool call destroys user data permanently.

2. **Itemised preview before confirming.** The confirmation message must include:
   - Count of items being destroyed (for `empty-recycle-bin` — chain `list-recycle-bin` first)
   - Names of items (truncate to top 5 if more, with "…and N more")
   - The exact phrase "This **cannot** be undone."

3. **Require typed confirmation for `empty-recycle-bin`.** Use the SDK elicitation to ask for a typed phrase (e.g. "empty") rather than a yes/no button. Yes/no is too easy to misfire on a bulk destructive op. `confirmAction` may not support this directly — may need to drop to raw elicitation against the server ref. If that's not feasible, at minimum require two successive yes/no prompts ("Are you sure?" → "Really sure? This cannot be undone.").

4. **Annotations:**
   ```ts
   annotations: {
     readOnlyHint: false,
     destructiveHint: true,
     idempotentHint: false,
   }
   ```
   Mark both permanent-delete and empty-recycle-bin with `destructiveHint: true` so hosting clients can flag them in UI.

5. **`permanent-delete-recycle-bin-item`:** fetch the item name and original location via `list-recycle-bin` before asking, so the elicitation message reads "Permanently delete 'Blog Post Draft' (originally under /home/blog)? This cannot be undone." — not "Delete item abc-123-def?"

## Why This Matters

- Without `list-recycle-bin`, agents can't help users find what was trashed.
- Without `permanent-delete` / `empty-recycle-bin`, editors can't free up the bin without going to the backoffice — reasonable, but incomplete coverage.

## Scope

- 3 new tools: `list-recycle-bin`, `permanent-delete-recycle-bin-item`, `empty-recycle-bin`
- New pattern for "strong elicitation" — likely worth extracting into a helper (`confirmDestructive` or similar) since future irreversible tools will need the same treatment

## Impact

High — closes the recycle bin gap and sets the safety pattern for irreversible operations across the server.
