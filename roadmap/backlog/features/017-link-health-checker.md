# Internal Link Health Checker

## The Editor's Problem

Internal links break silently. Pages get moved, renamed, or deleted, and links from other pages go stale. The Umbraco redirect system catches URL changes, but content pickers and hard-coded links in rich text can still break. Editors have no way to find broken internal links without manually clicking every link on every page.

## What This Enables

**"Are there any broken links on our site?"** — Scan all content for internal references and verify each target exists and is published.

**"What links to the page I'm about to delete?"** — Before deleting, check inbound references across all content types (content pickers, rich text links, URL properties).

**"Show me all external links on the site"** — Our `report-outbound-links` does this, but combined with status checking, the LLM could identify which external links might be dead.

**"Find orphaned pages"** — Pages that exist but aren't linked from anywhere in the content tree (our `report-orphan-pages` does the tree check, but not link analysis).

## How It Works

1. `report-content-references` — get reference data for pages
2. `report-outbound-links` — find external links
3. `get-page` — read content for rich text link analysis
4. LLM analysis — parse rich text for href links, check content picker values
5. Cross-reference: are all linked pages still published?

## Proposed Tool: `check-link-health`

**Input:**
- `id` (uuid, optional) — check a specific page, or omit for whole site
- `includeExternal` (boolean, optional) — also check external links

**Output:**
- Healthy links count
- Broken internal links: source page, property, target page (missing/draft/trashed)
- Suspicious external links (if checked)
- Pages with no inbound links (orphans from a linking perspective)

## Why This Goes Beyond the UI

The UI has no link checker. The Info tab shows "Referenced by" for one page at a time. There's no way to scan all rich text content for links and verify their targets. The LLM can parse HTML content in rich text fields, extract links, and cross-reference them against the content tree.

## Editor Story

> "We restructured the site last month. Can you check if any internal links broke?"

The LLM scans all pages, finds 8 links pointing to moved/renamed pages (some caught by redirects, some not), and offers to update the source pages with the correct new links.
