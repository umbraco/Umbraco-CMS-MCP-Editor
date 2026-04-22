# Count Children / Section Size

## The Friction

"How many blog posts do we have?" or "How many pages are in the Products section?" In the UI, you'd need to expand the tree node, and if there are more than a screenful, scroll and count. For nested sections, you'd need to expand every sub-node too. There's no count anywhere in the UI.

## Proposed Tool: `count-descendants`

**Input:**
- `parentId` (uuid) — section to count
- `recursive` (boolean, default true) — include nested children

**Output:**
- Direct children: 7
- Total descendants: 34
- By document type: "12 Article, 7 Category, 5 Author, 10 Article List"
- By status: "28 published, 4 draft, 2 scheduled"

## Why It Matters

This is a one-second question that the UI can't answer. It feeds naturally into editorial planning: "We have 12 blog posts. We need 20 by end of month. That's 8 more to write."
