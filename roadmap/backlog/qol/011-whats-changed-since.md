# "What's Changed Since...?"

## The Friction

An editor returns from holiday, or a manager checks in after a week. "What happened to the site while I was away?" In the UI, the only option is to browse the content tree looking for recently-modified indicators, or check the audit log page by page. There's no "show me everything that changed since Monday."

## Proposed Tool: `whats-changed`

**Input:**
- `since` (string) — date or natural language: "last Monday", "2026-04-01", "7 days ago"
- `parentId` (uuid, optional) — scope to a section

**Output:**
- Pages created, edited, published, unpublished, trashed since that date
- Grouped by action type
- Who made each change
- Summary: "Since Monday: 4 pages edited, 2 published, 1 new page created"

**API:** `GET /document/{id}/audit-log` has `sinceDate` parameter. Combined with `report-recently-changed`.

## Why It Matters

Every editor asks this question. The UI has no answer beyond manually browsing. The audit log API has the data — it just needs surfacing in a useful way.
