# Phase 4: Content Health, SEO & Reporting — Design Spec

## Overview

Add content auditing, SEO analysis, site structure reporting, and media health tools to the editor MCP. Four new collections, 16 new tools — all read-only, no elicitation.

These tools are fundamentally different from Phases 1-3. They return **hybrid data** (quick-scan flags + raw data for deep LLM analysis) shaped for three use cases:
1. **Text summaries** — "5 pages have missing meta descriptions"
2. **LLM reasoning** — "does this page's meta description match its content?"
3. **Diagram generation** — data structures that map naturally to Mermaid charts, heatmaps, matrices

All tools include page/media **URLs** (not just IDs) so the LLM can cross-reference with external sources like Google Analytics, Search Console, or CRM data connected in the same session.

## Design Principles

- **Tools fetch and shape data; the LLM analyses it.** Don't code SEO rules — return the inputs and let the LLM reason.
- **Flags for scanning, raw data for depth.** A flag like `hasMetaDescription: false` lets the LLM quickly identify issues without reading every field. The raw data is there when it needs to dig deeper.
- **Diagram-friendly structures.** Hierarchical data for tree diagrams, tabular for matrices, counted for pie/bar charts. The LLM generates Mermaid/SVG from the shape.
- **Cross-source ready.** Include URLs and dates so the LLM can join with analytics, search console, or other connected MCP servers.

## Collections

### `content-health` (5 tools)

Content quality and SEO auditing at the page and media level.

| Tool | Purpose | CMS delegation | Slices |
|------|---------|---------------|--------|
| `audit-page-seo` | SEO audit of a single page | `get-document-by-id` | `read` |
| `audit-page-content` | Content vs meta alignment check | `get-document-by-id` | `read` |
| `report-empty-fields` | Pages with blank expected fields | tree walk + `get-document-by-id` | `read` |
| `report-short-content` | Pages with thin content | tree walk + `get-document-by-id` | `read` |
| `check-media-alt-text` | Media items missing alt text | `get-collection-media` or tree walk | `read` |

### `content-reporting` (5 tools)

Content lifecycle, freshness, and translation reporting.

| Tool | Purpose | CMS delegation | Slices |
|------|---------|---------------|--------|
| `report-stale-content` | Pages not updated since a date | tree walk + variant dates | `read` |
| `report-unpublished` | Draft/unpublished pages | tree walk + state check | `read` |
| `report-recently-changed` | Pages changed within a period | tree walk + date filter | `read` |
| `report-content-by-type` | Page count by document type | tree walk + type grouping | `read` |
| `report-translation-coverage` | Pages vs languages gap matrix | tree walk + `get-language` | `read` |

### `site-structure` (3 tools)

Site architecture analysis.

| Tool | Purpose | CMS delegation | Slices |
|------|---------|---------------|--------|
| `report-site-tree-summary` | Full tree with counts per level | recursive tree walk | `read` |
| `report-orphan-pages` | Pages with no inbound content references | `get-document-by-id-referenced-by` | `read` |
| `report-deep-pages` | Pages buried more than N levels deep | recursive tree walk | `read` |

### `media-health` (3 tools)

Media library health and usage analysis.

| Tool | Purpose | CMS delegation | Slices |
|------|---------|---------------|--------|
| `report-unused-media` | Media not referenced by any content | `get-media-are-referenced` | `read` |
| `report-large-media` | Files above a size threshold | media tree walk + file size check | `read` |
| `report-content-references` | Which pages reference a given page/media | `get-document-by-id-referenced-by` / `get-media-by-id-referenced-by` | `read` |

## Tool Design Details

### Content Health Tools

**`audit-page-seo`**
- Input: `id` (uuid)
- Output:
  ```
  {
    id, name, url,
    // Flags for quick scanning
    hasTitle: boolean,
    hasMetaDescription: boolean,
    metaDescriptionLength: number,
    titleLength: number,
    headingCount: number,
    imagesWithoutAlt: number,
    totalImages: number,
    bodyWordCount: number,
    // Raw data for deep analysis
    title: string,
    metaDescription: string,
    headings: [{ level, text }],
    images: [{ src, alt, hasAlt }],
  }
  ```
- Fetches page via `get-document-by-id`, extracts SEO-relevant fields from values/variants. Parses rich text content for headings and images.
- Description: "Audit a page's SEO health. Returns title, meta description, headings, images with alt text status, and word count. Includes flags for quick scanning and raw data for detailed analysis. Use with analytics data to prioritise high-traffic pages."

**`audit-page-content`**
- Input: `id` (uuid)
- Output:
  ```
  {
    id, name, url,
    hasMetaDescription: boolean,
    bodyWordCount: number,
    metaDescription: string,
    bodyContent: string (first ~2000 chars of text content),
    documentType: string,
    lastModified: string,
  }
  ```
- Returns content body alongside meta description so the LLM can assess whether they align.
- Description: "Get a page's content body alongside its meta description for alignment analysis. The LLM can assess whether the meta accurately describes the content. Returns the first ~2000 characters of body text."

**`report-empty-fields`**
- Input: optional `parentId` (uuid, scope to subtree), `take` (default 50), `skip` (default 0)
- Output:
  ```
  {
    items: [{
      id, name, url, documentType,
      emptyFields: [{ alias, label }],
      emptyFieldCount: number,
    }],
    total, scannedPages
  }
  ```
- Walks the content tree, checks each page's values for empty/null/undefined fields.
- Description: "Find pages with blank or missing property values. Scans pages in a subtree and reports which fields are empty. Use parentId to scope to a section of the site. Scans up to 100 pages per call."

**`report-short-content`**
- Input: `minWordCount` (number, default 100), optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output:
  ```
  {
    items: [{
      id, name, url, documentType,
      wordCount: number,
      lastModified: string,
    }],
    total, scannedPages, threshold: number
  }
  ```
- Description: "Find pages with thin content below a word count threshold. Default threshold is 100 words. Use parentId to scope to a subtree. Scans up to 100 pages per call."

**`check-media-alt-text`**
- Input: optional `parentId` (uuid, scope to media folder), `take` (default 50), `skip` (default 0)
- Output:
  ```
  {
    items: [{
      id, name, url, mediaType,
      hasAlt: boolean,
      altText: string | null,
    }],
    totalImages, missingAltCount, scannedItems
  }
  ```
- Scans image media items (not folders) for alt text in their property values.
- Description: "Scan media items for missing alt text. Returns each image with its alt text status. Use parentId to scope to a specific media folder. Important for accessibility and SEO."

### Content Reporting Tools

**`report-stale-content`**
- Input: `daysSinceUpdate` (number, default 180), optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output:
  ```
  {
    items: [{
      id, name, url, documentType,
      lastModified: string,
      daysSinceUpdate: number,
    }],
    total, scannedPages, threshold: number
  }
  ```
- Description: "Find pages not updated within a given number of days. Default threshold is 180 days. Returns pages sorted by staleness (oldest first). Use with analytics data to find high-traffic stale pages."

**`report-unpublished`**
- Input: optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output:
  ```
  {
    items: [{
      id, name, url, documentType,
      state: string (draft/unpublished),
      lastModified: string,
    }],
    total, scannedPages
  }
  ```
- Description: "Find pages that are in draft state or have been unpublished. Useful for identifying content that may have been forgotten or needs review before publishing."

**`report-recently-changed`**
- Input: `daysBack` (number, default 7), optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output:
  ```
  {
    items: [{
      id, name, url, documentType,
      lastModified: string,
      daysAgo: number,
    }],
    total, scannedPages, period: number
  }
  ```
- Description: "Find pages changed within a recent time period. Default is the last 7 days. Returns pages sorted by most recently changed. Useful for reviewing recent editorial activity."

**`report-content-by-type`**
- Input: optional `parentId` (uuid)
- Output:
  ```
  {
    items: [{
      documentType: string,
      alias: string,
      count: number,
      pages: [{ id, name, url }]  (first 5 examples)
    }],
    totalTypes: number,
    totalPages: number
  }
  ```
- Walks the entire tree (or subtree), groups by document type, returns counts and examples.
- Description: "Breakdown of content pages by document type. Shows how many pages use each type with example pages. The data maps naturally to pie or bar charts. Scans up to 500 pages."

**`report-translation-coverage`**
- Input: optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output:
  ```
  {
    languages: [{ isoCode, name }],
    items: [{
      id, name, url,
      cultures: { [isoCode]: boolean }
    }],
    summary: {
      [isoCode]: { translated: number, missing: number, percentage: number }
    },
    total, scannedPages
  }
  ```
- Matrix format: pages as rows, languages as columns. Summary gives per-language coverage stats.
- Description: "Translation coverage matrix showing which pages have which language variants. Includes per-language summary statistics. The data maps naturally to a grid/matrix visualisation."

### Site Structure Tools

**`report-site-tree-summary`**
- Input: optional `parentId` (uuid), `maxDepth` (number, default 5)
- Output:
  ```
  {
    tree: [{
      id, name, url, documentType, depth: number,
      childCount: number,
      children: [recursive]
    }],
    totalPages: number,
    maxDepthFound: number,
    pagesPerLevel: { [depth]: number }
  }
  ```
- Recursively walks the tree up to maxDepth. Returns hierarchical structure ready for Mermaid flowchart generation.
- Description: "Full site tree structure with page counts per level. Returns hierarchical data that maps to tree diagrams, sitemaps, and flowcharts. Use maxDepth to limit how deep to scan."

**`report-orphan-pages`**
- Input: optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output:
  ```
  {
    items: [{
      id, name, url, documentType,
      inboundReferenceCount: number,
    }],
    total, scannedPages
  }
  ```
- For each page, calls `get-document-by-id-referenced-by` to check inbound references. Pages with zero references are orphans.
- Description: "Find pages with no inbound content references from other pages. These 'orphan' pages may be unreachable or forgotten. Scans up to 100 pages per call."

**`report-deep-pages`**
- Input: `maxDepth` (number, default 4), optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output:
  ```
  {
    items: [{
      id, name, url, documentType,
      depth: number,
      path: [{ id, name }]
    }],
    total, scannedPages, threshold: number
  }
  ```
- Walks the tree and reports pages deeper than maxDepth. Includes the full path (breadcrumb) to each deep page.
- Description: "Find pages buried more than N levels deep in the site tree. Deep pages are harder for users to find and may indicate poor information architecture. Default threshold is 4 levels."

### Media Health Tools

**`report-unused-media`**
- Input: optional `parentId` (uuid, scope to folder), `take` (default 50), `skip` (default 0)
- Output:
  ```
  {
    items: [{
      id, name, url, mediaType,
      fileSize: number,
      lastModified: string,
    }],
    total, scannedItems,
    totalFileSize: number
  }
  ```
- Calls `get-media-are-referenced` to batch-check which items are in use. Returns only unreferenced items.
- Description: "Find media items not referenced by any content page. These unused files waste storage and clutter the media library. Includes total file size of unused items."

**`report-large-media`**
- Input: `minSizeKb` (number, default 1024 = 1MB), optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output:
  ```
  {
    items: [{
      id, name, url, mediaType,
      fileSizeKb: number,
      dimensions: { width, height } | null,
    }],
    total, scannedItems, threshold: number
  }
  ```
- Description: "Find media files above a size threshold. Default is 1MB. Large files slow page loads and waste bandwidth. Returns file size and dimensions where available."

**`report-content-references`**
- Input: `id` (uuid), `type` (enum: "document" | "media")
- Output:
  ```
  {
    id, name, url, type,
    referencedBy: [{
      id, name, url, documentType,
      propertyAlias: string
    }],
    referenceCount: number
  }
  ```
- Delegates to `get-document-by-id-referenced-by` or `get-media-by-id-referenced-by` based on type.
- Description: "Find which pages reference a given content page or media item. Useful before deleting or restructuring content to understand the impact."

## Mode Registry

New modes:
- `content-health` — includes `content-health` + `content-reporting` collections
- `site-structure` — includes `site-structure` collection
- `media-health` — includes `media-health` collection

## Slice Registry

No new slices needed — all tools use `read`.

## Worker Configuration

No worker.ts changes needed.

## Performance Notes

Several tools walk the content/media tree which involves N+1 queries. Mitigations:
- All tree-walking tools cap at a configurable number of items (typically 100 pages)
- `parentId` parameter allows scoping to a subtree
- `take`/`skip` pagination on results
- `report-content-by-type` has a higher cap (500) since it needs breadth for meaningful stats
- `report-site-tree-summary` has a `maxDepth` parameter
- Tool descriptions document the scan limits

## Testing

### Integration tests (per collection, using integration-test-creator agent)
- `content-health/__tests__/` — audit-page-seo, audit-page-content on a known page, check-media-alt-text, report-empty-fields, report-short-content
- `content-reporting/__tests__/` — all 5 reporting tools with basic structure validation
- `site-structure/__tests__/` — report-site-tree-summary, report-deep-pages, report-orphan-pages
- `media-health/__tests__/` — report-unused-media, report-large-media, report-content-references

### Eval tests (using eval-test-creator agent)
- "Audit the homepage SEO" — requires audit-page-seo
- "Check if the homepage meta description matches its content" — requires audit-page-content
- "Which pages haven't been updated in 6 months?" — requires report-stale-content
- "Show me the site structure as a tree" — requires report-site-tree-summary
- "Find images without alt text" — requires check-media-alt-text
- "Which media files are unused?" — requires report-unused-media
- "What's the translation coverage across the site?" — requires report-translation-coverage

## File Structure

```
src/umbraco-api/tools/
  content-health/
    index.ts
    get/
      audit-page-seo.ts
      audit-page-content.ts
      report-empty-fields.ts
      report-short-content.ts
      check-media-alt-text.ts
    __tests__/
  content-reporting/
    index.ts
    get/
      report-stale-content.ts
      report-unpublished.ts
      report-recently-changed.ts
      report-content-by-type.ts
      report-translation-coverage.ts
    __tests__/
  site-structure/
    index.ts
    get/
      report-site-tree-summary.ts
      report-orphan-pages.ts
      report-deep-pages.ts
    __tests__/
  media-health/
    index.ts
    get/
      report-unused-media.ts
      report-large-media.ts
      report-content-references.ts
    __tests__/
```

## Success Criteria

- 16 new tools registered and working in both stdio and hosted modes
- All tools are read-only (no elicitation)
- Hybrid output: flags for scanning + raw data for LLM analysis
- URLs included in all outputs for cross-source integration
- Diagram-friendly data shapes (hierarchical, tabular, counted)
- Integration and eval tests pass
- Total tool count: 56 (40 existing + 16 new)
