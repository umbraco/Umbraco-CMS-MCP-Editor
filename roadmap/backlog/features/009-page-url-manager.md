# Page URL and Redirect Manager

## The Editor's Problem

When editors rename pages or move them in the content tree, URLs change. Umbraco's redirect tracking catches some of these, but editors often don't realise:
- What URL a page will have before publishing
- Whether a URL change will break bookmarked links
- What redirects already exist for old URLs
- Whether duplicate content exists at different URLs

In the UI, URL information is scattered: the page's URL is on the Info tab, redirects are on a separate dashboard, and there's no preview of what a URL change would look like.

## What This Enables

**"What URL does this page have?"** — Quick answer without navigating to the Info tab.

**"What would happen to the URL if I rename this page?"** — Preview the URL change before making it.

**"Show me all redirects on the site"** — We have `list-redirects`, but combined with page data, the LLM can show: "Old URL → New URL → Page Name → Status"

**"Find pages with bad URLs"** — Detect URLs that are too long, contain special characters, have unnecessary depth, or don't match the page's actual content.

**"Which pages have the deepest URLs?"** — Our `report-deep-pages` shows tree depth, but the LLM can combine this with actual URL data to find pages where the URL path is unwieldy.

## API Endpoints Used

- `GET /document/urls` — get URLs for multiple documents at once
- `GET /document/{id}/preview-url` — get the preview URL
- `GET /redirect-management` — list all redirects
- `GET /redirect-management/status` — check if redirect tracking is enabled

## Proposed Tool: `get-page-urls`

**Input:**
- `id` (uuid) — page ID (or array of IDs)

**Output:**
- Published URL(s) — one per culture for multilingual sites
- Preview URL
- Any redirects pointing to this page
- URL depth/length analysis

## Why This Goes Beyond the UI

The UI shows the URL on one page's Info tab. To audit URLs across the site, you'd need to open every single page. The API's `GET /document/urls` endpoint accepts multiple IDs at once — but the UI never uses this capability for a cross-site URL audit.

The LLM can:
- Build a complete URL map of the site
- Detect URL patterns that hurt SEO (too deep, too long, non-descriptive)
- Find URL conflicts or near-duplicates
- Suggest URL improvements based on SEO best practices

## Editor Story

> "I'm about to reorganize the blog section by moving articles into category subfolders. What URLs will change?"

The LLM gets current URLs for all affected pages, simulates the move, shows what the new URLs would be, identifies which pages have external backlinks (if analytics data is available), and warns about potential SEO impact.
