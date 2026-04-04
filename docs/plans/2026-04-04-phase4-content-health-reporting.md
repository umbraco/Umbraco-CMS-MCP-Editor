# Phase 4: Content Health, SEO & Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **IMPORTANT:** Use `umbraco-mcp-skills` agents and skills for all tool, test, and eval creation.

**Goal:** Add 16 read-only content auditing, SEO analysis, site structure, and media health tools that return hybrid data (flags + raw data) for LLM reasoning and diagram generation.

**Architecture:** All tools are read-only (no elicitation), delegate to CMS via `mcpClientManager.callTool("cms", ...)`. Tree-walking tools compose multiple CMS calls with configurable scan limits. Output includes URLs for cross-source integration and diagram-friendly data shapes.

**Tech Stack:** TypeScript, Zod schemas, @umbraco-cms/mcp-server-sdk, @umbraco-cms/mcp-dev (chained CMS tools)

---

### Task 1: Add modes to registry

**Files:**
- Modify: `src/config/mode-registry.ts`

- [ ] **Step 1: Add 3 new modes**

Add to the `toolModes` array in `src/config/mode-registry.ts`:

```typescript
{
  name: 'content-health',
  displayName: 'Content Health',
  description: 'Content auditing, SEO analysis, and content reporting',
  collections: ['content-health', 'content-reporting']
},
{
  name: 'site-structure',
  displayName: 'Site Structure',
  description: 'Site architecture analysis and structure reporting',
  collections: ['site-structure']
},
{
  name: 'media-health',
  displayName: 'Media Health',
  description: 'Media library health and usage analysis',
  collections: ['media-health']
},
```

- [ ] **Step 2: Compile and commit**

Run: `npm run compile`

```bash
git add src/config/mode-registry.ts
git commit -m "feat: add content-health, site-structure, media-health modes to registry"
```

---

### Task 2: Create shared tree-walking helper

Several tools need to walk the content tree, fetching pages and checking properties. Extract this into a shared helper to avoid duplicating the N+1 query pattern across 8+ tools.

**Files:**
- Create: `src/umbraco-api/tools/helpers/tree-walker.ts`

- [ ] **Step 1: Create the tree walker helper**

Create `src/umbraco-api/tools/helpers/tree-walker.ts`:

```typescript
/**
 * Content Tree Walker
 *
 * Shared helper for tools that need to scan pages in the content tree.
 * Fetches tree items then enriches each with full document data.
 * Used by reporting and auditing tools.
 */

import { mcpClientManager } from "../../mcp-client.js";
import { extractChainedResult } from "@umbraco-cms/mcp-server-sdk";

export interface TreeWalkOptions {
  /** Scope to a subtree (omit for root) */
  parentId?: string;
  /** Max items to fetch from the tree */
  scanLimit?: number;
}

export interface WalkedPage {
  id: string;
  name: string;
  url: string;
  documentType: string;
  documentTypeAlias: string;
  values: any[];
  variants: any[];
  state: string;
  depth?: number;
}

/**
 * Walk the content tree and return enriched page data.
 *
 * Fetches tree items (root or children), then calls get-document-by-id
 * for each to get full property values. Uses Promise.all for parallelism.
 *
 * @param options - parentId and scanLimit
 * @returns Array of enriched page objects
 */
export async function walkContentTree(
  options: TreeWalkOptions = {},
): Promise<WalkedPage[]> {
  const { parentId, scanLimit = 100 } = options;

  // Fetch tree items
  const treeResult = parentId
    ? await mcpClientManager.callTool("cms", "get-tree-document-children", { parentId, take: scanLimit, skip: 0 })
    : await mcpClientManager.callTool("cms", "get-tree-document-root", { take: scanLimit, skip: 0 });

  if (treeResult.isError) return [];
  const treeData = extractChainedResult(treeResult);
  const treeItems: any[] = treeData?.items ?? [];

  // Enrich each item with full document data in parallel
  const enriched = await Promise.all(
    treeItems.map(async (item: any): Promise<WalkedPage | null> => {
      try {
        const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: item.id });
        if (docResult.isError) return null;
        const doc = extractChainedResult(docResult);
        const variant = doc.variants?.[0] ?? {};

        return {
          id: doc.id,
          name: variant.name ?? doc.name ?? "Unknown",
          url: doc.urls?.[0]?.url ?? "",
          documentType: doc.documentType?.name ?? "",
          documentTypeAlias: doc.documentType?.alias ?? "",
          values: doc.values ?? [],
          variants: doc.variants ?? [],
          state: variant.state ?? doc.state ?? "unknown",
        };
      } catch {
        return null;
      }
    }),
  );

  return enriched.filter((p): p is WalkedPage => p !== null);
}

/**
 * Walk the media tree and return items.
 *
 * @param options - parentId and scanLimit
 * @returns Array of media items
 */
export async function walkMediaTree(
  options: TreeWalkOptions = {},
): Promise<any[]> {
  const { parentId, scanLimit = 100 } = options;

  const result = parentId
    ? await mcpClientManager.callTool("cms", "get-media-children", { parentId, take: scanLimit, skip: 0 })
    : await mcpClientManager.callTool("cms", "get-media-root", { take: scanLimit, skip: 0 });

  if (result.isError) return [];
  const data = extractChainedResult(result);
  return data?.items ?? [];
}
```

- [ ] **Step 2: Compile and commit**

Run: `npm run compile`

```bash
git add src/umbraco-api/tools/helpers/
git commit -m "feat: add shared tree-walker helper for reporting tools"
```

---

### Task 3: Create `content-health` collection — 5 tools

Use the `mcp-tool-creator` agent to create each tool.

**Files:**
- Create: `src/umbraco-api/tools/content-health/index.ts`
- Create: `src/umbraco-api/tools/content-health/get/audit-page-seo.ts`
- Create: `src/umbraco-api/tools/content-health/get/audit-page-content.ts`
- Create: `src/umbraco-api/tools/content-health/get/report-empty-fields.ts`
- Create: `src/umbraco-api/tools/content-health/get/report-short-content.ts`
- Create: `src/umbraco-api/tools/content-health/get/check-media-alt-text.ts`

- [ ] **Step 1: Create `audit-page-seo` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `audit-page-seo`
- Input: `id` (uuid)
- Output: `{ id, name, url, hasTitle, hasMetaDescription, metaDescriptionLength, titleLength, headingCount, imagesWithoutAlt, totalImages, bodyWordCount, title, metaDescription, headings: [{ level, text }], images: [{ src, alt, hasAlt }] }`
- Delegate to: `mcpClientManager.callTool("cms", "get-document-by-id", { id })`
- Extract SEO fields from values: look for common aliases like `metaDescription`, `pageTitle`, `seoMetaDescription`, `umbracoNaviHide`. Parse rich text values for `<h1>`-`<h6>` headings and `<img>` tags with alt attributes.
- Use a simple regex-based parser for extracting headings and images from HTML content values.
- Compute flags: `hasTitle = !!title`, `hasMetaDescription = !!metaDescription && metaDescription.length > 0`, etc.
- Compute `bodyWordCount` by stripping HTML tags from all text values and counting words.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Audit a page's SEO health. Returns title, meta description, headings, images with alt text status, and word count. Includes flags for quick scanning and raw data for detailed analysis. Use with analytics data to prioritise high-traffic pages."`

- [ ] **Step 2: Create `audit-page-content` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `audit-page-content`
- Input: `id` (uuid)
- Output: `{ id, name, url, hasMetaDescription, bodyWordCount, metaDescription, bodyContent, documentType, lastModified }`
- Delegate to: `mcpClientManager.callTool("cms", "get-document-by-id", { id })`
- Extract meta description from values. Extract body content by stripping HTML from all text/richtext values, concatenating, and truncating to ~2000 characters.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Get a page's content body alongside its meta description for alignment analysis. The LLM can assess whether the meta accurately describes the content. Returns the first ~2000 characters of body text."`

- [ ] **Step 3: Create `report-empty-fields` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-empty-fields`
- Input: optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, url, documentType, emptyFields: [{ alias }], emptyFieldCount }], total, scannedPages }`
- Import and use `walkContentTree` from `../../helpers/tree-walker.js`
- For each page, check values array for empty/null/undefined/empty-string values. Report only pages that have at least one empty field.
- Apply take/skip pagination on the filtered results.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Find pages with blank or missing property values. Scans pages in a subtree and reports which fields are empty. Use parentId to scope to a section. Scans up to 100 pages per call."`

- [ ] **Step 4: Create `report-short-content` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-short-content`
- Input: `minWordCount` (number, optional, default 100), optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, url, documentType, wordCount, lastModified }], total, scannedPages, threshold }`
- Import and use `walkContentTree` from `../../helpers/tree-walker.js`
- Compute word count by stripping HTML from all text values and counting words. Filter to pages below threshold.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Find pages with thin content below a word count threshold. Default threshold is 100 words. Use parentId to scope to a subtree. Scans up to 100 pages per call."`

- [ ] **Step 5: Create `check-media-alt-text` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `check-media-alt-text`
- Input: optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, url, mediaType, hasAlt, altText }], totalImages, missingAltCount, scannedItems }`
- Import and use `walkMediaTree` from `../../helpers/tree-walker.js`
- For each media item, call `mcpClientManager.callTool("cms", "get-media-by-id", { id })` to get property values. Look for `umbracoAltText` or `altText` alias. Filter to image types only (not folders).
- Also call `get-media-urls` to include URL.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Scan media items for missing alt text. Returns each image with its alt text status. Use parentId to scope to a specific media folder. Important for accessibility and SEO."`

- [ ] **Step 6: Create collection index**

Create `src/umbraco-api/tools/content-health/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import auditPageSeoTool from "./get/audit-page-seo.js";
import auditPageContentTool from "./get/audit-page-content.js";
import reportEmptyFieldsTool from "./get/report-empty-fields.js";
import reportShortContentTool from "./get/report-short-content.js";
import checkMediaAltTextTool from "./get/check-media-alt-text.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "content-health",
    displayName: "Content Health",
    description: "Content quality auditing and SEO analysis",
  },
  tools: () => [auditPageSeoTool, auditPageContentTool, reportEmptyFieldsTool, reportShortContentTool, checkMediaAltTextTool],
};

export default collection;
```

- [ ] **Step 7: Compile and commit**

Run: `npm run compile`

```bash
git add src/umbraco-api/tools/content-health/
git commit -m "feat: add content-health collection with SEO audit, content audit, empty fields, short content, alt text tools"
```

---

### Task 4: Create `content-reporting` collection — 5 tools

Use the `mcp-tool-creator` agent for each tool.

**Files:**
- Create: `src/umbraco-api/tools/content-reporting/index.ts`
- Create: `src/umbraco-api/tools/content-reporting/get/report-stale-content.ts`
- Create: `src/umbraco-api/tools/content-reporting/get/report-unpublished.ts`
- Create: `src/umbraco-api/tools/content-reporting/get/report-recently-changed.ts`
- Create: `src/umbraco-api/tools/content-reporting/get/report-content-by-type.ts`
- Create: `src/umbraco-api/tools/content-reporting/get/report-translation-coverage.ts`

- [ ] **Step 1: Create `report-stale-content` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-stale-content`
- Input: `daysSinceUpdate` (number, optional, default 180), optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, url, documentType, lastModified, daysSinceUpdate }], total, scannedPages, threshold }`
- Import and use `walkContentTree` from `../../helpers/tree-walker.js`
- For each page, extract `updateDate` from variant. Calculate days since update. Filter to pages exceeding threshold. Sort by stalest first.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Find pages not updated within a given number of days. Default threshold is 180 days. Returns pages sorted by staleness. Use with analytics data to find high-traffic stale pages."`

- [ ] **Step 2: Create `report-unpublished` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-unpublished`
- Input: optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, url, documentType, state, lastModified }], total, scannedPages }`
- Import and use `walkContentTree` from `../../helpers/tree-walker.js`
- Filter to pages where state is "Draft" or "NotCreated" (not "Published").
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Find pages that are in draft state or have been unpublished. Useful for identifying content that may have been forgotten or needs review before publishing."`

- [ ] **Step 3: Create `report-recently-changed` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-recently-changed`
- Input: `daysBack` (number, optional, default 7), optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, url, documentType, lastModified, daysAgo }], total, scannedPages, period }`
- Import and use `walkContentTree` from `../../helpers/tree-walker.js`
- Filter to pages modified within the period. Sort by most recent first.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Find pages changed within a recent time period. Default is the last 7 days. Returns pages sorted by most recently changed. Useful for reviewing recent editorial activity."`

- [ ] **Step 4: Create `report-content-by-type` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-content-by-type`
- Input: optional `parentId` (uuid)
- Output: `{ items: [{ documentType, alias, count, pages: [{ id, name, url }] }], totalTypes, totalPages }`
- Import and use `walkContentTree` from `../../helpers/tree-walker.js` with `scanLimit: 500`
- Group pages by documentType. For each type, include up to 5 example pages.
- Sort by count descending.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Breakdown of content pages by document type. Shows how many pages use each type with example pages. Data maps naturally to pie or bar charts. Scans up to 500 pages."`

- [ ] **Step 5: Create `report-translation-coverage` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-translation-coverage`
- Input: optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output: `{ languages: [{ isoCode, name }], items: [{ id, name, url, cultures: { [isoCode]: boolean } }], summary: { [isoCode]: { translated, missing, percentage } }, total, scannedPages }`
- First call `mcpClientManager.callTool("cms", "get-language", { take: 100, skip: 0 })` to get all languages.
- Then use `walkContentTree` to get pages. For each page, check which language variants exist.
- Build summary stats per language.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Translation coverage matrix showing which pages have which language variants. Includes per-language summary statistics. Data maps naturally to a grid/matrix visualisation."`

- [ ] **Step 6: Create collection index**

Create `src/umbraco-api/tools/content-reporting/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportStaleContentTool from "./get/report-stale-content.js";
import reportUnpublishedTool from "./get/report-unpublished.js";
import reportRecentlyChangedTool from "./get/report-recently-changed.js";
import reportContentByTypeTool from "./get/report-content-by-type.js";
import reportTranslationCoverageTool from "./get/report-translation-coverage.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "content-reporting",
    displayName: "Content Reporting",
    description: "Content lifecycle, freshness, and translation reporting",
  },
  tools: () => [reportStaleContentTool, reportUnpublishedTool, reportRecentlyChangedTool, reportContentByTypeTool, reportTranslationCoverageTool],
};

export default collection;
```

- [ ] **Step 7: Compile and commit**

Run: `npm run compile`

```bash
git add src/umbraco-api/tools/content-reporting/
git commit -m "feat: add content-reporting collection with stale, unpublished, recent, by-type, translation coverage tools"
```

---

### Task 5: Create `site-structure` collection — 3 tools

Use the `mcp-tool-creator` agent for each tool.

**Files:**
- Create: `src/umbraco-api/tools/site-structure/index.ts`
- Create: `src/umbraco-api/tools/site-structure/get/report-site-tree-summary.ts`
- Create: `src/umbraco-api/tools/site-structure/get/report-orphan-pages.ts`
- Create: `src/umbraco-api/tools/site-structure/get/report-deep-pages.ts`

- [ ] **Step 1: Create `report-site-tree-summary` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-site-tree-summary`
- Input: optional `parentId` (uuid), `maxDepth` (number, optional, default 5)
- Output: `{ tree: [{ id, name, url, documentType, depth, childCount, children: [recursive] }], totalPages, maxDepthFound, pagesPerLevel: { [depth]: number } }`
- Recursively walk the tree using `mcpClientManager.callTool("cms", "get-tree-document-children", ...)` up to maxDepth. Start from root or parentId.
- At each level, fetch children and recurse. Count pages per level.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Full site tree structure with page counts per level. Returns hierarchical data that maps to tree diagrams, sitemaps, and flowcharts. Use maxDepth to limit how deep to scan."`

- [ ] **Step 2: Create `report-orphan-pages` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-orphan-pages`
- Input: optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, url, documentType, inboundReferenceCount }], total, scannedPages }`
- Import and use `walkContentTree` from `../../helpers/tree-walker.js`
- For each page, call `mcpClientManager.callTool("cms", "get-document-by-id-referenced-by", { id: page.id })` to check inbound references. Filter to pages with zero references.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Find pages with no inbound content references from other pages. These orphan pages may be unreachable or forgotten. Scans up to 100 pages per call."`

- [ ] **Step 3: Create `report-deep-pages` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-deep-pages`
- Input: `maxDepth` (number, optional, default 4), optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, url, documentType, depth, path: [{ id, name }] }], total, scannedPages, threshold }`
- Recursively walk the tree (similar to report-site-tree-summary but flattened). Track depth and path (breadcrumb) for each page. Return only pages deeper than maxDepth.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Find pages buried more than N levels deep in the site tree. Deep pages are harder for users to find. Default threshold is 4 levels. Includes the full path to each deep page."`

- [ ] **Step 4: Create collection index**

Create `src/umbraco-api/tools/site-structure/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportSiteTreeSummaryTool from "./get/report-site-tree-summary.js";
import reportOrphanPagesTool from "./get/report-orphan-pages.js";
import reportDeepPagesTool from "./get/report-deep-pages.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "site-structure",
    displayName: "Site Structure",
    description: "Site architecture analysis and structure reporting",
  },
  tools: () => [reportSiteTreeSummaryTool, reportOrphanPagesTool, reportDeepPagesTool],
};

export default collection;
```

- [ ] **Step 5: Compile and commit**

Run: `npm run compile`

```bash
git add src/umbraco-api/tools/site-structure/
git commit -m "feat: add site-structure collection with tree summary, orphan pages, deep pages tools"
```

---

### Task 6: Create `media-health` collection — 3 tools

Use the `mcp-tool-creator` agent for each tool.

**Files:**
- Create: `src/umbraco-api/tools/media-health/index.ts`
- Create: `src/umbraco-api/tools/media-health/get/report-unused-media.ts`
- Create: `src/umbraco-api/tools/media-health/get/report-large-media.ts`
- Create: `src/umbraco-api/tools/media-health/get/report-content-references.ts`

- [ ] **Step 1: Create `report-unused-media` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-unused-media`
- Input: optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, url, mediaType, fileSize, lastModified }], total, scannedItems, totalFileSize }`
- Import and use `walkMediaTree` from `../../helpers/tree-walker.js`
- For each media item, call `mcpClientManager.callTool("cms", "get-media-are-referenced", { id: [item.id] })` to check if referenced. Filter to unreferenced items. Enrich with URL via `get-media-urls`.
- Sum file sizes for `totalFileSize`.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Find media items not referenced by any content page. Unused files waste storage and clutter the media library. Includes total file size of unused items."`

- [ ] **Step 2: Create `report-large-media` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-large-media`
- Input: `minSizeKb` (number, optional, default 1024), optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, url, mediaType, fileSizeKb, dimensions }], total, scannedItems, threshold }`
- Import and use `walkMediaTree` from `../../helpers/tree-walker.js`
- For each media item, call `get-media-by-id` to get property values. Extract `umbracoBytes` for file size, `umbracoWidth`/`umbracoHeight` for dimensions. Filter to items above threshold. Enrich with URL.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Find media files above a size threshold. Default is 1MB (1024KB). Large files slow page loads and waste bandwidth. Returns file size and dimensions where available."`

- [ ] **Step 3: Create `report-content-references` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `report-content-references`
- Input: `id` (uuid), `type` (enum: "document" | "media")
- Output: `{ id, name, url, type, referencedBy: [{ id, name, url, documentType, propertyAlias }], referenceCount }`
- When type is "document": call `mcpClientManager.callTool("cms", "get-document-by-id", { id })` for name/url, then `get-document-by-id-referenced-by` for references.
- When type is "media": call `get-media-by-id` for name, `get-media-urls` for url, `get-media-by-id-referenced-by` for references.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Find which pages reference a given content page or media item. Useful before deleting or restructuring content to understand the impact."`

- [ ] **Step 4: Create collection index**

Create `src/umbraco-api/tools/media-health/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportUnusedMediaTool from "./get/report-unused-media.js";
import reportLargeMediaTool from "./get/report-large-media.js";
import reportContentReferencesTool from "./get/report-content-references.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "media-health",
    displayName: "Media Health",
    description: "Media library health and usage analysis",
  },
  tools: () => [reportUnusedMediaTool, reportLargeMediaTool, reportContentReferencesTool],
};

export default collection;
```

- [ ] **Step 5: Compile and commit**

Run: `npm run compile`

```bash
git add src/umbraco-api/tools/media-health/
git commit -m "feat: add media-health collection with unused media, large media, content references tools"
```

---

### Task 7: Register collections and wire into entry points

**Files:**
- Modify: `src/collections.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Update collections.ts**

Add the 4 new collection imports and register them:

```typescript
import contentHealthCollection from "./umbraco-api/tools/content-health/index.js";
import contentReportingCollection from "./umbraco-api/tools/content-reporting/index.js";
import siteStructureCollection from "./umbraco-api/tools/site-structure/index.js";
import mediaHealthCollection from "./umbraco-api/tools/media-health/index.js";
```

Add to the collections array.

- [ ] **Step 2: Update index.ts**

Add the same 4 imports and register in the collections array in `src/index.ts`.

- [ ] **Step 3: Compile, build, test**

Run: `npm run compile && npm run build`
Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=__tests__ --runInBand --forceExit`
Expected: All existing 83 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/collections.ts src/index.ts
git commit -m "feat: register content-health, content-reporting, site-structure, media-health collections"
```

---

### Task 8: Review tools with mcp-tool-reviewer

- [ ] **Step 1: Run tool review**

Use the `mcp-tool-reviewer` agent to review all 16 new tools across:
- `src/umbraco-api/tools/content-health/` (5 tools)
- `src/umbraco-api/tools/content-reporting/` (5 tools)
- `src/umbraco-api/tools/site-structure/` (3 tools)
- `src/umbraco-api/tools/media-health/` (3 tools)

- [ ] **Step 2: Apply review feedback and commit**

```bash
git add -A
git commit -m "fix: apply tool review feedback to Phase 4 tools"
```

---

### Task 9: Integration tests for `content-health` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/content-health/__tests__/content-health.test.ts`

- [ ] **Step 1: Create tests**

Tests should cover:
- `audit-page-seo`: audit a known page, verify flags (hasTitle, hasMetaDescription, etc.) and raw data (headings array, images array)
- `audit-page-content`: verify returns bodyContent and metaDescription
- `report-empty-fields`: scan root, verify structure
- `report-short-content`: scan with threshold, verify structure
- `check-media-alt-text`: scan media root, verify item shape
- Error path: `audit-page-seo` with non-existent UUID

- [ ] **Step 2: Run tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=content-health/__tests__ --runInBand --forceExit
git add src/umbraco-api/tools/content-health/__tests__/
git commit -m "test: add content-health collection integration tests"
```

---

### Task 10: Integration tests for `content-reporting` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/content-reporting/__tests__/content-reporting.test.ts`

- [ ] **Step 1: Create tests**

Tests should cover:
- `report-stale-content`: verify structure, threshold in response
- `report-unpublished`: verify structure
- `report-recently-changed`: verify structure, period in response
- `report-content-by-type`: verify items grouped by type with counts
- `report-translation-coverage`: verify languages array, cultures matrix, summary stats

- [ ] **Step 2: Run tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=content-reporting/__tests__ --runInBand --forceExit
git add src/umbraco-api/tools/content-reporting/__tests__/
git commit -m "test: add content-reporting collection integration tests"
```

---

### Task 11: Integration tests for `site-structure` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/site-structure/__tests__/site-structure.test.ts`

- [ ] **Step 1: Create tests**

Tests should cover:
- `report-site-tree-summary`: verify hierarchical tree structure, pagesPerLevel, totalPages
- `report-orphan-pages`: verify structure (may return empty)
- `report-deep-pages`: verify structure, threshold in response

- [ ] **Step 2: Run tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=site-structure/__tests__ --runInBand --forceExit
git add src/umbraco-api/tools/site-structure/__tests__/
git commit -m "test: add site-structure collection integration tests"
```

---

### Task 12: Integration tests for `media-health` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/media-health/__tests__/media-health.test.ts`

- [ ] **Step 1: Create tests**

Tests should cover:
- `report-unused-media`: verify structure, totalFileSize field
- `report-large-media`: verify structure, threshold in response
- `report-content-references` with type "document": verify referencedBy array
- `report-content-references` with type "media": verify structure
- Error path: report-content-references with non-existent UUID

- [ ] **Step 2: Run tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=media-health/__tests__ --runInBand --forceExit
git add src/umbraco-api/tools/media-health/__tests__/
git commit -m "test: add media-health collection integration tests"
```

---

### Task 13: Eval tests for content health and reporting workflows

Use the `eval-test-creator` agent.

**Files:**
- Create: `tests/evals/content-health-workflows.test.ts`
- Modify: all existing eval files to update `allTools` arrays

- [ ] **Step 1: Create eval tests**

Create `tests/evals/content-health-workflows.test.ts` with 7 scenarios:

1. "Audit the homepage SEO" — requires `audit-page-seo`, pattern: /seo|title|meta|heading/i
2. "Does the homepage meta description match its content?" — requires `audit-page-content`, pattern: /meta|content|description|match/i
3. "Which pages haven't been updated in 6 months?" — requires `report-stale-content`, pattern: /stale|updated|month|day/i
4. "Show me the site structure" — requires `report-site-tree-summary`, pattern: /tree|site|structure|page|level/i
5. "Find images without alt text" — requires `check-media-alt-text`, pattern: /alt|image|media|accessibility/i
6. "Which media files are unused?" — requires `report-unused-media`, pattern: /unused|media|referenced/i
7. "What's the translation coverage?" — requires `report-translation-coverage`, pattern: /translation|coverage|language|percentage/i

- [ ] **Step 2: Update allTools arrays in all eval files**

Add the 16 new tool names to allTools in all existing eval files.

- [ ] **Step 3: Run evals and commit**

Run: `npm run test:evals`

```bash
git add tests/evals/
git commit -m "test: add content health and reporting eval tests, update allTools arrays"
```

---

### Task 14: Update hosted e2e test tool list

**Files:**
- Modify: `tests/hosted-e2e/mcp-inspector.test.ts`
- Modify: `tests/hosted-e2e/elicitation.test.ts`

- [ ] **Step 1: Update ALL_TOOLS arrays**

Add the 16 new tool names to both hosted e2e files (56 tools total).

- [ ] **Step 2: Run hosted e2e tests**

Run: `HEADLESS=true SLOW_MO=0 npx playwright test --config tests/hosted-e2e/playwright.config.ts`
Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/hosted-e2e/
git commit -m "test: update hosted e2e tests for 56-tool count"
```

---

### Task 15: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run compile
npm run build
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=__tests__ --runInBand --forceExit
npm run test:evals
HEADLESS=true SLOW_MO=0 npx playwright test --config tests/hosted-e2e/playwright.config.ts
```

Expected:
- Compile: clean
- Build: clean
- Integration tests: ~100+ passing
- Evals: ~42 passing
- Hosted e2e: 4 passing

- [ ] **Step 2: Verify tool count**

Confirm 56 tools registered (40 existing + 16 new).

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: Phase 4 complete — 56 tools across 14 collections"
```
