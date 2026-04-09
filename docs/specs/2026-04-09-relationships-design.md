# Relationships Collection — Design Spec

## Overview

A new `relationships` collection that gives AI assistants full visibility into how content connects — inbound references, outbound links (internal and external), media usage, and cross-content dependencies. Provides the foundational data for the LLM to reason about impact analysis, content audits, and relationship mapping.

## Approach

Create a dedicated `relationships` collection containing 4 new tools plus 3 migrated tools from existing collections. This consolidates all relationship data into a single discoverable collection.

## Tool Inventory

### Migrated Tools (3)

| Tool | From Collection | What It Does |
|------|----------------|--------------|
| `report-content-references` | `media-health` | Inbound references for a page or media item |
| `report-orphan-pages` | `site-structure` | Pages with zero inbound references |
| `report-unused-media` | `media-health` | Media not referenced by any content |

These tools move without functional changes — same names, same inputs/outputs, same CMS delegation.

### New Tools (4)

#### `report-outbound-links`

**Purpose:** Show everything a page links to — internal content, media, and external URLs.

**Input:**
- `id` (uuid, required) — page to analyse

**Output:**
```
internalPages: [{ id, name, url, documentType }]
media: [{ id, name, mediaType }]
externalUrls: [{ url, domain }]
summary: { internalPageCount, mediaCount, externalUrlCount, totalLinks }
```

**CMS delegation:** `get-document-by-id` to fetch page content, then local parsing of property values.

**Implementation:** Iterate all properties on the document. Detect UUID-based references (content pickers, media pickers). Parse rich text HTML for `<a href>` and `<img src>`. Extract external URLs and classify as internal vs external. Resolve internal content/media IDs to names via CMS calls.

---

#### `report-most-referenced`

**Purpose:** Rank content or media by inbound reference count across a subtree — surfaces the most critical items that would have the biggest impact if changed or deleted.

**Input:**
- `parentId` (uuid, optional) — scope to subtree, defaults to root
- `take` (number, optional, default 20) — results to return
- `skip` (number, optional, default 0) — pagination offset
- `type` (enum: "document" | "media" | "all", optional, default "document") — what to scan

**Output:**
```
items: [{ id, name, url, documentType, referenceCount }]
total: number
scannedItems: number
```

**CMS delegation:** Tree walk via `get-tree-document-root`/`get-tree-document-children` (or media equivalents), then `get-document-by-id-referenced-by` or `get-media-by-id-referenced-by` for each item.

**Performance:** Capped at 100 items scanned per call, consistent with existing reporting tools.

---

#### `report-relationship-map`

**Purpose:** Full bidirectional relationship view for a single page — everything that references it plus everything it references. The "one-stop" tool for understanding a page's connections.

**Input:**
- `id` (uuid, required) — page to map

**Output:**
```
inbound: [{ id, name, url, documentType }]
outbound:
  internalPages: [{ id, name, url, documentType }]
  media: [{ id, name, mediaType }]
  externalUrls: [{ url, domain }]
summary:
  inboundCount: number
  outboundInternalCount: number
  outboundMediaCount: number
  outboundExternalCount: number
  totalConnections: number
```

**CMS delegation:** `get-document-by-id-referenced-by` for inbound, `get-document-by-id` + local parsing for outbound (same logic as `report-outbound-links`).

---

#### `report-external-links`

**Purpose:** Inventory all external URLs across a subtree, grouped by domain. Useful for auditing third-party dependencies, finding outdated links, or understanding external integration points.

**Input:**
- `parentId` (uuid, optional) — scope to subtree, defaults to root
- `take` (number, optional, default 50) — domains to return
- `skip` (number, optional, default 0) — pagination offset

**Output:**
```
byDomain: [{
  domain: string
  urls: [{ url, foundOn: [{ pageId, pageName, pageUrl }] }]
  urlCount: number
}]
totalUrls: number
totalDomains: number
scannedPages: number
```

**CMS delegation:** Tree walk via `get-tree-document-root`/`get-tree-document-children`, `get-document-by-id` for each page, then local URL extraction.

**Performance:** Capped at 100 pages scanned per call.

---

## Shared Link Extraction Helper

A new helper at `src/umbraco-api/tools/helpers/link-extractor.ts` shared by `report-outbound-links`, `report-relationship-map`, and `report-external-links`.

**Responsibilities:**
- Detect UUID-based references in property values (content pickers, media pickers, block list/grid content)
- Parse rich text HTML for `<a href>` and `<img src>` tags
- Extract external URLs and classify internal vs external
- Return a structured `ExtractedLinks` object: `{ contentIds: string[], mediaIds: string[], externalUrls: { url, domain }[] }`

**What it does NOT do:**
- Validate whether links are alive (no HTTP checks)
- Resolve front-end routing (no URL-to-content mapping)

## Collection Structure

```
src/umbraco-api/tools/relationships/
├── index.ts                         # ToolCollectionExport
├── get/
│   ├── report-outbound-links.ts
│   ├── report-most-referenced.ts
│   ├── report-relationship-map.ts
│   ├── report-external-links.ts
│   ├── report-content-references.ts  # moved from media-health
│   ├── report-orphan-pages.ts        # moved from site-structure
│   └── report-unused-media.ts        # moved from media-health
└── __tests__/
    └── *.test.ts
```

## Configuration

**Mode registration** (`config/mode-registry.ts`):
- New mode: `relationships` → `['relationships']`

**Slice registration:**
- All tools: `slices: ['read']` — everything is read-only

**Annotations:**
- All tools: `readOnlyHint: true`

## Migration Steps

1. Move `report-content-references.ts` from `media-health/get/` to `relationships/get/`
2. Move `report-orphan-pages.ts` from `site-structure/get/` to `relationships/get/`
3. Move `report-unused-media.ts` from `media-health/get/` to `relationships/get/`
4. Remove migrated tools from old collection indexes
5. Register all 7 tools in `relationships/index.ts`
6. Update eval files: remove migrated tools from old `allTools`, add all 7 to new relationships eval

## Testing

### Integration Tests

Follow existing patterns:
- `setupTestEnvironment()` in describe block
- CMS-dependent early return with `console.warn` if unavailable
- Test each new tool with real Umbraco data
- Verify migrated tools work from new collection

**Key test scenarios:**
- `report-outbound-links`: page with content pickers, media pickers, rich text with internal and external links
- `report-most-referenced`: returns items sorted descending by reference count
- `report-relationship-map`: both inbound and outbound sections populated
- `report-external-links`: groups URLs by domain, includes page references
- Migrated tools: unchanged behaviour from new collection

### Eval Tests

New `relationships.test.ts` with scenarios for each tool using `runScenarioTest`. All 7 tools in `allTools` array. Update existing eval files to remove migrated tools from their arrays.

## Performance Notes

- Tree-walking tools (`report-most-referenced`, `report-external-links`) capped at 100 items scanned — consistent with existing reporting tools
- `report-outbound-links` and `report-relationship-map` are single-page tools — bounded by page content size
- N+1 query pattern for `report-most-referenced` (one `referenced-by` call per item) — acceptable at 100-item cap, but worth revisiting if the CMS adds batch reference endpoints

## Success Criteria

- All 7 tools registered and callable via MCP
- Migrated tools produce identical output from new collection
- Link extraction correctly identifies content pickers, media pickers, rich text links, and external URLs
- `report-relationship-map` gives a complete bidirectional view in a single call
- `report-external-links` correctly groups by domain with source page attribution
- All integration tests passing
- All eval scenarios passing
