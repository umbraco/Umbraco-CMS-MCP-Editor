# List All Pages of a Specific Type

## The Friction

An editor wants to see all articles, or all product pages, or all contact pages. In the UI, the only way is the Advanced Search dashboard — navigate to Content > Advanced Search tab, select the document type, click Search. That's 3+ clicks and a section change.

Our `search-content` does keyword search. `report-content-by-type` gives counts by type. But neither gives a simple "show me all Article pages" with their key details.

## Proposed Tool: `list-pages-by-type`

**Input:**
- `documentType` (string) — type alias or name (e.g. "article", "Article")
- `parentId` (uuid, optional) — scope to a section
- `take` (number, default 50) — limit

**Output:**
- List of all pages of that type: name, path, status, last edited, key property values
- Total count

**API:** `GET /item/document/search` has `allowedDocumentTypes` parameter. `GET /collection/document/{id}` has filtering.

## Why It Matters

"Show me all blog posts" is one of the most natural editorial questions. It should be one command, not a multi-step navigation to a dashboard. Pairs naturally with follow-up actions: "Now bulk-publish the ones from this month."
