# Publish an Entire Section

## The Friction

The UI has "Publish with descendants" on content nodes, which publishes a page and all its children. But this requires the parent page to also be publishable — if the parent has validation errors or is intentionally draft, you can't use it.

What editors often want is: "Publish everything under this section that's ready." Not necessarily the parent, and not items with validation issues — just everything that CAN be published.

Our `bulk-publish` tool takes explicit IDs (max 10). `publish-page` with `includeDescendants` mirrors the UI behaviour. Neither offers "publish everything ready in this section."

## Proposed Tool: `publish-section`

**Input:**
- `parentId` (uuid) — section root
- `includeParent` (boolean, default true)
- `dryRun` (boolean, default false) — just show what would be published

**Behaviour:**
1. Walk all descendants
2. Identify pages that have unpublished changes
3. Skip pages that are intentionally draft (never published and no publish date)
4. Optionally validate each page first
5. Show summary: "Ready to publish: 15 pages. Skipping: 2 pages (validation errors), 3 pages (never published)"
6. Publish all ready pages
7. Report results

**Dry run mode** is key — the editor can preview the impact before committing. "What WOULD happen if I published this whole section?"

## Why It Matters

After a content sprint where a team has been editing 20 pages, someone needs to publish everything. "Publish with descendants" is all-or-nothing — it includes the parent and tries to publish everything. This tool is smarter: it skips problems, reports what it can't do, and gives the editor control.

## Real Editor Scenarios

- "We've finished updating the Services section. Publish everything."
- "What would change if I published everything under Products?" (dry run)
- "Publish all the new blog posts but skip the one that's still being reviewed"
