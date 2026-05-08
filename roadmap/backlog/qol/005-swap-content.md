# Swap / Reorder Content in Block Lists

## The Friction

Block lists and block grids are the primary way editors build page content in modern Umbraco. Reordering blocks within a page is possible via drag-and-drop in the UI, but:
- Moving a block from position 8 to position 2 requires careful dragging through a long list
- There's no "move to top" or "move to bottom" shortcut
- You can't swap two blocks' positions
- You can't move a block from one page's block list to another page's block list

For block grids, the spatial layout makes reordering even harder — dragging in a 2D grid is fiddly.

## Proposed Tool: `reorder-blocks`

**Input:**
- `id` (uuid) — page ID
- `propertyAlias` (string) — the block list/grid property
- `order` (array of integers or block indices) — new order

**Behaviour:**
1. Read current blocks via `inspect-blocks`
2. Show current order for confirmation
3. Apply new order
4. Save

## Proposed Tool: `move-block-between-pages`

**Input:**
- `sourceId` (uuid) — source page
- `targetId` (uuid) — target page
- `sourcePropertyAlias` (string) — source block list property
- `targetPropertyAlias` (string) — target block list property  
- `blockIndex` (number) — which block to move
- `targetPosition` (number, optional) — where to insert on target (default: end)

**Behaviour:**
1. Read source blocks
2. Extract the specified block
3. Insert into target page's block list
4. Remove from source (or copy, keeping original)
5. Save both pages

## Why It Matters

Block content is the future of Umbraco editing. Every modern Umbraco site uses blocks extensively. The UI handles single-page block management, but cross-page block operations are impossible. An LLM that can manipulate block structures programmatically unlocks workflows the UI physically can't support.

## Real Editor Scenarios

- "Move the testimonial block to the top of the page"
- "Copy the pricing table block from the Enterprise page to the Startup page"
- "Swap the hero banner and the feature grid on the homepage"
- "Take the FAQ block from the old Support page and add it to the new Help page"
