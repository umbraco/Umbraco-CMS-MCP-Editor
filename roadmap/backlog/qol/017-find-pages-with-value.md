# Find Pages Where a Property Has a Specific Value

## The Friction

"Which pages have 'isIndexable' set to false?" or "Which pages use this specific image?" or "Which articles are by Paul Seal?" In the UI, there's no way to filter pages by property value. You'd have to open every page and check.

The search finds text in content, but it can't search by structured property values like booleans, media picker selections, or content picker references.

## Proposed Tool: `find-pages-by-value`

**Input:**
- `alias` (string) — property alias to search
- `value` (any) — value to match (or "empty" / "not-empty" for existence checks)
- `parentId` (uuid, optional) — scope to a section
- `documentType` (string, optional) — filter by type

**Output:**
- List of matching pages: name, path, status

## Why It Matters

This is a database query that the UI simply cannot express. Examples:

- "Which pages are hidden from navigation?" → find where `umbracoNaviHide` = true
- "Which articles don't have an author set?" → find where `author` is empty
- "Which pages use the old hero image?" → find where `mainImage` contains a specific media ID
- "Which pages have a scheduled publish?" → find where scheduledPublishDate is not null

Every one of these is impossible in the UI without opening every page. The API returns all property values — the LLM just needs to scan them.
