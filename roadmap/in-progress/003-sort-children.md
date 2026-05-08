# Sort Children

## Problem

The Umbraco UI has a **"Sort children..."** entity action on both content and media nodes. This opens a dialog where editors can drag-and-drop to reorder child items. The sort order affects how content appears on the website (navigation menus, listing pages, etc.).

We have **no equivalent tool** for sorting/reordering children.

## UI Workflow (Reproduction Steps)

### Content:
1. Navigate to Content section
2. Click the **"..."** menu on any parent node (e.g. Home)
3. Select **"Sort children..."**
4. A dialog appears showing all child nodes with drag handles
5. Drag items to reorder
6. Click Save

### Media:
1. Navigate to Media section  
2. Click the **"..."** menu on any folder (e.g. Sample Images)
3. Select **"Sort children..."**
4. Same drag-and-drop reorder dialog

## Proposed Tool: `sort-children`

**Input:**
- `parentId` (uuid) — the parent node whose children to sort
- `sortedIds` (array of uuid) — child IDs in the desired order
- `type` (enum: "content" | "media", optional, default "content") — whether sorting content or media

**Behaviour:**
1. Fetch current children and their names for confirmation
2. Confirm: "Reorder X children of 'Parent Name'?"
3. Call the CMS sort endpoint with the new order
4. Return success with the new order

**Why this matters:**
- Sort order directly affects the live website (navigation, listings)
- An LLM could intelligently suggest reordering: "Sort your blog posts by date", "Move the most important page to the top"
- Particularly useful for bulk reorganization tasks
- Without this tool, there's no way to programmatically control page order

## Impact

Medium — important for content organization but not an everyday action.
