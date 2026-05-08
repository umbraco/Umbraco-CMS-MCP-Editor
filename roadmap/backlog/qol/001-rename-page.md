# Rename Page

## The Friction

To rename a page in Umbraco, an editor has to:
1. Navigate to the page in the content tree (click, wait for load)
2. Click the name field at the top of the workspace
3. Clear and type the new name
4. Click Save (or Save and publish)

That's 4 steps and a full page load just to change a name. If an editor needs to rename 5 pages — perhaps tidying up page names after a content review — that's 20 steps across 5 page loads.

Our `edit-page` tool updates properties, but the page name is NOT a property — it's separate from the values array. There's currently no way to rename a page through our tools without going through the full document update.

## Proposed Tool: `rename-page`

**Input:**
- `id` (uuid) — page to rename
- `newName` (string) — the new name

**Behaviour:**
1. Fetch current page to show old name
2. Confirm: "Rename 'Old Name' to 'New Name'?"
3. Update via the document PUT endpoint (which accepts the name in the variant)
4. Return confirmation

**Why it matters:**
- Single most basic content operation — should be one command
- URL may change (Umbraco generates URL segments from name) — tool should warn about this
- Pairs naturally with conversation: "Rename 'Blog Post 1' to 'Getting Started with Umbraco'"

## Bonus: `bulk-rename`

Rename multiple pages at once. Useful for:
- "Add 'ARCHIVED: ' prefix to all pages in the old events section"
- "Remove '(Draft)' from all page names"  
- Pattern-based renaming
