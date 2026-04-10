# Relationships Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `relationships` collection with 7 tools (3 migrated + 4 new) that expose content relationship data — inbound references, outbound links, and external URLs — for the LLM to reason about.

**Architecture:** New `relationships` collection registered in both `index.ts` and `collections.ts`. Migrates 3 existing tools from `media-health` and `site-structure`. A shared `link-extractor.ts` helper parses property values (pickers, rich text, blocks) to extract outbound references. All tools are read-only and use MCP chaining to the CMS dev server.

**Tech Stack:** TypeScript, Zod schemas, `@umbraco-cms/mcp-server-sdk`, MCP chaining via `mcpClientManager`

---

### Task 1: Create the link-extractor helper

**Files:**
- Create: `src/umbraco-api/tools/helpers/link-extractor.ts`

This shared helper extracts outbound links from a page's property values. It detects UUID-based references (content pickers, media pickers), parses rich text HTML for `<a href>` and `<img src>` tags, and extracts external URLs. Used by `report-outbound-links`, `report-relationship-map`, and `report-external-links`.

- [ ] **Step 1: Create the link-extractor helper**

```typescript
// src/umbraco-api/tools/helpers/link-extractor.ts

/**
 * Link Extractor
 *
 * Shared helper for extracting outbound references from page property values.
 * Detects content/media picker UUIDs, rich text links, and external URLs.
 */

// UUID v4 pattern for detecting picker references
const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export interface ExtractedLinks {
  /** UUIDs of referenced content documents */
  contentIds: string[];
  /** UUIDs of referenced media items */
  mediaIds: string[];
  /** External URLs found in content */
  externalUrls: { url: string; domain: string }[];
}

/**
 * Check if a value is a BlockList or BlockGrid structure.
 */
function isBlockListOrGridValue(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.contentData)
  );
}

/**
 * Check if a value is Rich Text with embedded blocks.
 */
function isRteWithBlocks(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.markup === "string" &&
    value.blocks !== null &&
    typeof value.blocks === "object" &&
    Array.isArray(value.blocks?.contentData)
  );
}

/**
 * Check if a value is a plain Rich Text value (markup string, no blocks).
 */
function isPlainRteValue(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof value.markup === "string" &&
    !isRteWithBlocks(value)
  );
}

/**
 * Extract <a href="..."> URLs from HTML.
 */
function extractHrefUrls(html: string): string[] {
  const urls: string[] = [];
  const regex = /<a[^>]+href="([^"]*)"[^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const href = match[1];
    if (href && !href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("tel:")) {
      urls.push(href);
    }
  }
  return urls;
}

/**
 * Extract <img src="..."> URLs from HTML.
 */
function extractImgSrcs(html: string): string[] {
  const srcs: string[] = [];
  const regex = /<img[^>]+src="([^"]*)"[^>]*>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    if (match[1]) srcs.push(match[1]);
  }
  return srcs;
}

/**
 * Parse a URL and return its domain, or null if invalid.
 */
function getDomain(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Check if a URL is external (starts with http:// or https://).
 */
function isExternalUrl(url: string): boolean {
  return url.startsWith("http://") || url.startsWith("https://");
}

/**
 * Extract all UUIDs from a string value (e.g. a content/media picker stored as a UUID string).
 */
function extractUuids(value: string): string[] {
  const matches = value.match(UUID_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Recursively extract block property values from BlockList/BlockGrid/RTE blocks.
 */
function extractBlockValues(contentData: any[]): any[] {
  const values: any[] = [];
  for (const block of contentData) {
    if (Array.isArray(block.values)) {
      values.push(...block.values);
    }
  }
  return values;
}

/**
 * Extract all outbound links from a page's property values.
 *
 * Processes:
 * - String values that are UUIDs (content/media pickers)
 * - Array values containing objects with UUIDs (multi-pickers)
 * - Rich text markup (plain and with blocks) for <a> and <img> tags
 * - BlockList/BlockGrid contentData (recursively inspects block properties)
 *
 * Returns deduplicated lists of content IDs, media IDs, and external URLs.
 * Note: We cannot reliably distinguish content picker UUIDs from media picker
 * UUIDs at this level — callers should resolve IDs against both endpoints.
 */
export function extractLinksFromValues(values: any[]): ExtractedLinks {
  const allUuids = new Set<string>();
  const externalUrlMap = new Map<string, string>(); // url -> domain

  function processHtml(html: string): void {
    // Extract link hrefs
    for (const href of extractHrefUrls(html)) {
      if (isExternalUrl(href)) {
        const domain = getDomain(href);
        if (domain) externalUrlMap.set(href, domain);
      } else {
        // Internal link — may contain a UUID (e.g. /{localLink:uuid})
        for (const uuid of extractUuids(href)) {
          allUuids.add(uuid.toLowerCase());
        }
      }
    }
    // Extract image srcs
    for (const src of extractImgSrcs(html)) {
      if (isExternalUrl(src)) {
        const domain = getDomain(src);
        if (domain) externalUrlMap.set(src, domain);
      } else {
        for (const uuid of extractUuids(src)) {
          allUuids.add(uuid.toLowerCase());
        }
      }
    }
    // Also scan the raw HTML for UUIDs (catches data-udi and similar attributes)
    for (const uuid of extractUuids(html)) {
      allUuids.add(uuid.toLowerCase());
    }
  }

  function processValue(v: any): void {
    const val = v.value;

    if (val === null || val === undefined) return;

    // String value — could be a UUID or URL
    if (typeof val === "string") {
      if (isExternalUrl(val)) {
        const domain = getDomain(val);
        if (domain) externalUrlMap.set(val, domain);
      } else {
        for (const uuid of extractUuids(val)) {
          allUuids.add(uuid.toLowerCase());
        }
      }
      return;
    }

    // Array value — multi-picker (array of objects with contentId/mediaKey/id)
    if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") {
          for (const uuid of extractUuids(item)) {
            allUuids.add(uuid.toLowerCase());
          }
        } else if (typeof item === "object" && item !== null) {
          // Multi-node picker: { contentId: uuid } or { mediaKey: uuid } or { unique: uuid }
          const id = item.contentId ?? item.mediaKey ?? item.unique ?? item.id ?? item.key;
          if (typeof id === "string") {
            for (const uuid of extractUuids(id)) {
              allUuids.add(uuid.toLowerCase());
            }
          }
          // Multi-URL picker: { url: "...", ... }
          if (typeof item.url === "string" && isExternalUrl(item.url)) {
            const domain = getDomain(item.url);
            if (domain) externalUrlMap.set(item.url, domain);
          }
        }
      }
      return;
    }

    // Object value — check for RTE, blocks, or picker objects
    if (typeof val === "object") {
      // RTE with blocks
      if (isRteWithBlocks(val)) {
        processHtml(val.markup);
        const blockValues = extractBlockValues(val.blocks.contentData);
        for (const bv of blockValues) processValue(bv);
        return;
      }

      // Plain RTE
      if (isPlainRteValue(val)) {
        processHtml(val.markup);
        return;
      }

      // BlockList/BlockGrid
      if (isBlockListOrGridValue(val)) {
        const blockValues = extractBlockValues(val.contentData);
        for (const bv of blockValues) processValue(bv);
        return;
      }

      // Single picker object: { contentId: uuid } or { mediaKey: uuid }
      const id = val.contentId ?? val.mediaKey ?? val.unique ?? val.id ?? val.key;
      if (typeof id === "string") {
        for (const uuid of extractUuids(id)) {
          allUuids.add(uuid.toLowerCase());
        }
      }

      // URL picker: { url: "..." }
      if (typeof val.url === "string" && isExternalUrl(val.url)) {
        const domain = getDomain(val.url);
        if (domain) externalUrlMap.set(val.url, domain);
      }
    }
  }

  for (const v of values) {
    processValue(v);
  }

  const externalUrls = Array.from(externalUrlMap.entries()).map(([url, domain]) => ({ url, domain }));

  // We return all UUIDs as both contentIds and mediaIds — callers resolve which is which
  return {
    contentIds: Array.from(allUuids),
    mediaIds: [], // Populated by callers after resolution
    externalUrls,
  };
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run compile`
Expected: No errors in `link-extractor.ts`

- [ ] **Step 3: Commit**

```bash
git add src/umbraco-api/tools/helpers/link-extractor.ts
git commit -m "feat: add link-extractor helper for outbound reference parsing"
```

---

### Task 2: Create the relationships collection with migrated tools

**Files:**
- Create: `src/umbraco-api/tools/relationships/index.ts`
- Move: `src/umbraco-api/tools/media-health/get/report-content-references.ts` → `src/umbraco-api/tools/relationships/get/report-content-references.ts`
- Move: `src/umbraco-api/tools/site-structure/get/report-orphan-pages.ts` → `src/umbraco-api/tools/relationships/get/report-orphan-pages.ts`
- Move: `src/umbraco-api/tools/media-health/get/report-unused-media.ts` → `src/umbraco-api/tools/relationships/get/report-unused-media.ts`
- Modify: `src/umbraco-api/tools/media-health/index.ts`
- Modify: `src/umbraco-api/tools/site-structure/index.ts`
- Modify: `src/index.ts`
- Modify: `src/collections.ts`
- Modify: `src/config/mode-registry.ts`

- [ ] **Step 1: Create the directory structure and move files**

```bash
mkdir -p src/umbraco-api/tools/relationships/get
mkdir -p src/umbraco-api/tools/relationships/__tests__

# Move the 3 tools
git mv src/umbraco-api/tools/media-health/get/report-content-references.ts src/umbraco-api/tools/relationships/get/report-content-references.ts
git mv src/umbraco-api/tools/site-structure/get/report-orphan-pages.ts src/umbraco-api/tools/relationships/get/report-orphan-pages.ts
git mv src/umbraco-api/tools/media-health/get/report-unused-media.ts src/umbraco-api/tools/relationships/get/report-unused-media.ts
```

- [ ] **Step 2: Fix import paths in moved files**

The moved files have relative imports to `../../../mcp-client.js` and `../../helpers/tree-walker.js`. After moving one level deeper (from `media-health/get/` or `site-structure/get/` to `relationships/get/`), the depth is the same — no import path changes needed since both are at the same depth: `src/umbraco-api/tools/{collection}/get/`.

Verify by checking the import paths in each moved file:
- `report-content-references.ts`: imports from `"../../../mcp-client.js"` — correct (goes up to `src/umbraco-api/`)
- `report-orphan-pages.ts`: imports from `"../../helpers/tree-walker.js"` and `"../../../mcp-client.js"` — correct
- `report-unused-media.ts`: imports from `"../../../mcp-client.js"` and `"../../helpers/tree-walker.js"` — correct

- [ ] **Step 3: Create the collection index**

```typescript
// src/umbraco-api/tools/relationships/index.ts
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportContentReferencesTool from "./get/report-content-references.js";
import reportOrphanPagesTool from "./get/report-orphan-pages.js";
import reportUnusedMediaTool from "./get/report-unused-media.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "relationships",
    displayName: "Content Relationships",
    description: "Inbound references, outbound links, relationship mapping, and external URL inventory",
  },
  tools: () => [
    reportContentReferencesTool,
    reportOrphanPagesTool,
    reportUnusedMediaTool,
  ],
};

export default collection;
```

- [ ] **Step 4: Update media-health/index.ts to remove migrated tools**

The file should become:

```typescript
// src/umbraco-api/tools/media-health/index.ts
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportLargeMediaTool from "./get/report-large-media.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "media-health",
    displayName: "Media Health",
    description: "Media library health and usage analysis",
  },
  tools: () => [reportLargeMediaTool],
};

export default collection;
```

- [ ] **Step 5: Update site-structure/index.ts to remove migrated tool**

The file should become:

```typescript
// src/umbraco-api/tools/site-structure/index.ts
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import reportSiteTreeSummaryTool from "./get/report-site-tree-summary.js";
import reportDeepPagesTool from "./get/report-deep-pages.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "site-structure",
    displayName: "Site Structure",
    description: "Site architecture analysis and structure reporting",
  },
  tools: () => [reportSiteTreeSummaryTool, reportDeepPagesTool],
};

export default collection;
```

- [ ] **Step 6: Register the new collection in src/index.ts**

Add import after the existing collection imports (after line 43):

```typescript
import relationshipsCollection from "./umbraco-api/tools/relationships/index.js";
```

Add to the `collections` array (after `redirectCollection` on line 111):

```typescript
  relationshipsCollection,
```

- [ ] **Step 7: Register the new collection in src/collections.ts**

Add import after the existing collection imports (after line 41):

```typescript
import relationshipsCollection from "./umbraco-api/tools/relationships/index.js";
```

Add to the `collections` array (after `redirectCollection` on line 63):

```typescript
  relationshipsCollection,
```

- [ ] **Step 8: Add mode to mode-registry.ts**

Add a new mode entry to the `toolModes` array (after the `redirects` entry at line 98):

```typescript
  {
    name: 'relationships',
    displayName: 'Content Relationships',
    description: 'View inbound/outbound references, relationship mapping, and external link inventory',
    collections: ['relationships']
  },
```

- [ ] **Step 9: Verify it compiles**

Run: `npm run compile`
Expected: No errors. All imports resolve correctly.

- [ ] **Step 10: Run existing tests**

Run: `npm test`
Expected: All existing tests pass. The media-health and site-structure tests may need updating if they import the moved tools — check the test output.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: create relationships collection and migrate 3 existing tools"
```

---

### Task 3: Create report-outbound-links tool

**Files:**
- Create: `src/umbraco-api/tools/relationships/get/report-outbound-links.ts`
- Modify: `src/umbraco-api/tools/relationships/index.ts` (add import and registration)

- [ ] **Step 1: Create the tool**

```typescript
// src/umbraco-api/tools/relationships/get/report-outbound-links.ts
import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractLinksFromValues } from "../../helpers/link-extractor.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to analyze for outbound links"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  internalPages: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      documentType: z.string(),
    })
  ).describe("Content pages referenced by this page"),
  media: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      mediaType: z.string(),
    })
  ).describe("Media items referenced by this page"),
  externalUrls: z.array(
    z.object({
      url: z.string(),
      domain: z.string(),
    })
  ).describe("External URLs found in this page's content"),
  summary: z.object({
    internalPageCount: z.number(),
    mediaCount: z.number(),
    externalUrlCount: z.number(),
    totalLinks: z.number(),
  }),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-outbound-links",
  description: "Show everything a page links to — internal content pages, media items, and external URLs. Extracts references from content pickers, media pickers, rich text links, and block content. Use this to understand a page's dependencies before restructuring.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const result = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (result.isError) return createToolResultError(result);
    const doc = extractChainedResult(result);

    const variant = doc.variants?.[0] ?? {};
    const name = variant.name ?? doc.name ?? "Unknown";
    const url = doc.urls?.[0]?.url ?? "";
    const values: any[] = doc.values ?? [];

    // Extract all outbound references
    const links = extractLinksFromValues(values);

    // Resolve UUIDs: try each as document first, then as media
    const internalPages: { id: string; name: string; url: string; documentType: string }[] = [];
    const media: { id: string; name: string; mediaType: string }[] = [];

    // Filter out the page's own ID from references
    const candidateIds = links.contentIds.filter((cid) => cid !== id.toLowerCase());

    await Promise.all(
      candidateIds.map(async (refId) => {
        try {
          // Try as document first
          const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: refId });
          if (!docResult.isError) {
            const refDoc = extractChainedResult(docResult);
            const refVariant = refDoc.variants?.[0] ?? {};
            internalPages.push({
              id: refId,
              name: refVariant.name ?? refDoc.name ?? "Unknown",
              url: refDoc.urls?.[0]?.url ?? "",
              documentType: refDoc.documentType?.alias ?? "",
            });
            return;
          }
        } catch {
          // Not a document — try media
        }

        try {
          const mediaResult = await mcpClientManager.callTool("cms", "get-media-by-id", { id: refId });
          if (!mediaResult.isError) {
            const refMedia = extractChainedResult(mediaResult);
            media.push({
              id: refId,
              name: refMedia.variants?.[0]?.name ?? refMedia.name ?? "Unknown",
              mediaType: refMedia.mediaType?.alias ?? refMedia.contentTypeAlias ?? "",
            });
          }
        } catch {
          // Neither document nor media — skip
        }
      })
    );

    return createToolResult({
      id,
      name,
      url,
      internalPages,
      media,
      externalUrls: links.externalUrls,
      summary: {
        internalPageCount: internalPages.length,
        mediaCount: media.length,
        externalUrlCount: links.externalUrls.length,
        totalLinks: internalPages.length + media.length + links.externalUrls.length,
      },
    });
  },
};

export default withStandardDecorators(tool);
```

- [ ] **Step 2: Add import to relationships/index.ts**

Add import at top of the file:
```typescript
import reportOutboundLinksTool from "./get/report-outbound-links.js";
```

Add to the tools array:
```typescript
  tools: () => [
    reportContentReferencesTool,
    reportOrphanPagesTool,
    reportUnusedMediaTool,
    reportOutboundLinksTool,
  ],
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/umbraco-api/tools/relationships/get/report-outbound-links.ts src/umbraco-api/tools/relationships/index.ts
git commit -m "feat: add report-outbound-links tool"
```

---

### Task 4: Create report-most-referenced tool

**Files:**
- Create: `src/umbraco-api/tools/relationships/get/report-most-referenced.ts`
- Modify: `src/umbraco-api/tools/relationships/index.ts` (add import and registration)

- [ ] **Step 1: Create the tool**

```typescript
// src/umbraco-api/tools/relationships/get/report-most-referenced.ts
import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { walkContentTree, walkMediaTree } from "../../helpers/tree-walker.js";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("Scope to a subtree by parent page ID. Omit to scan root-level items."),
  take: z.number().optional().default(20).describe("Number of top results to return (default 20)"),
  skip: z.number().optional().default(0).describe("Number of results to skip for pagination (default 0)"),
  type: z.enum(["document", "media", "all"]).optional().default("document").describe("What type of content to scan: document, media, or all (default document)"),
};

const outputSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      type: z.enum(["document", "media"]),
      documentType: z.string().describe("Document type alias or media type alias"),
      referenceCount: z.number().describe("Number of pages that reference this item"),
    })
  ).describe("Items ranked by inbound reference count, highest first"),
  total: z.number().describe("Total number of items with at least one reference"),
  scannedItems: z.number().describe("Total number of items scanned"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-most-referenced",
  description: "Rank content or media by how many other pages reference them. Surfaces the most critical items — the ones with the biggest impact if changed or deleted. Scans up to 100 items per call.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, take, skip, type }) => {
    const results: { id: string; name: string; url: string; type: "document" | "media"; documentType: string; referenceCount: number }[] = [];

    // Scan documents
    if (type === "document" || type === "all") {
      const pages = await walkContentTree({ parentId, scanLimit: 100 });

      const docResults = await Promise.all(
        pages.map(async (page) => {
          try {
            const refResult = await mcpClientManager.callTool("cms", "get-document-by-id-referenced-by", { id: page.id });
            if (refResult.isError) return { page, count: 0 };
            const refData = extractChainedResult(refResult);
            const count: number = refData?.total ?? (Array.isArray(refData?.items) ? refData.items.length : 0);
            return { page, count };
          } catch {
            return { page, count: 0 };
          }
        })
      );

      for (const { page, count } of docResults) {
        results.push({
          id: page.id,
          name: page.name,
          url: page.url,
          type: "document",
          documentType: page.documentTypeAlias,
          referenceCount: count,
        });
      }
    }

    // Scan media
    if (type === "media" || type === "all") {
      const mediaItems = await walkMediaTree({ parentId, scanLimit: 100 });

      const mediaResults = await Promise.all(
        mediaItems.map(async (item: any) => {
          try {
            const refResult = await mcpClientManager.callTool("cms", "get-media-by-id-referenced-by", { id: item.id });
            if (refResult.isError) return { item, count: 0 };
            const refData = extractChainedResult(refResult);
            const count: number = refData?.total ?? (Array.isArray(refData?.items) ? refData.items.length : 0);
            return { item, count };
          } catch {
            return { item, count: 0 };
          }
        })
      );

      for (const { item, count } of mediaResults) {
        results.push({
          id: item.id,
          name: item.name ?? item.variants?.[0]?.name ?? "Unknown",
          url: "",
          type: "media",
          documentType: item.mediaType?.alias ?? item.contentTypeAlias ?? "",
          referenceCount: count,
        });
      }
    }

    // Sort by reference count descending, filter to items with at least 1 reference
    const withRefs = results
      .filter((r) => r.referenceCount > 0)
      .sort((a, b) => b.referenceCount - a.referenceCount);

    const paginated = withRefs.slice(skip, skip + take);

    return createToolResult({
      items: paginated,
      total: withRefs.length,
      scannedItems: results.length,
    });
  },
};

export default withStandardDecorators(tool);
```

- [ ] **Step 2: Add import to relationships/index.ts**

Add import:
```typescript
import reportMostReferencedTool from "./get/report-most-referenced.js";
```

Add to tools array:
```typescript
    reportMostReferencedTool,
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/umbraco-api/tools/relationships/get/report-most-referenced.ts src/umbraco-api/tools/relationships/index.ts
git commit -m "feat: add report-most-referenced tool"
```

---

### Task 5: Create report-relationship-map tool

**Files:**
- Create: `src/umbraco-api/tools/relationships/get/report-relationship-map.ts`
- Modify: `src/umbraco-api/tools/relationships/index.ts` (add import and registration)

- [ ] **Step 1: Create the tool**

```typescript
// src/umbraco-api/tools/relationships/get/report-relationship-map.ts
import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractLinksFromValues } from "../../helpers/link-extractor.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to map relationships for"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  inbound: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      documentType: z.string(),
    })
  ).describe("Pages that reference this page"),
  outbound: z.object({
    internalPages: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        url: z.string(),
        documentType: z.string(),
      })
    ).describe("Content pages this page references"),
    media: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        mediaType: z.string(),
      })
    ).describe("Media items this page references"),
    externalUrls: z.array(
      z.object({
        url: z.string(),
        domain: z.string(),
      })
    ).describe("External URLs in this page's content"),
  }),
  summary: z.object({
    inboundCount: z.number(),
    outboundInternalCount: z.number(),
    outboundMediaCount: z.number(),
    outboundExternalCount: z.number(),
    totalConnections: z.number(),
  }),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-relationship-map",
  description: "Full bidirectional relationship view for a page — everything that references it (inbound) and everything it references (outbound: content, media, external URLs). The one-stop tool for understanding a page's connections before making changes.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    // Fetch document and inbound references in parallel
    const [docResult, refResult] = await Promise.all([
      mcpClientManager.callTool("cms", "get-document-by-id", { id }),
      mcpClientManager.callTool("cms", "get-document-by-id-referenced-by", { id }),
    ]);

    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);

    const variant = doc.variants?.[0] ?? {};
    const name = variant.name ?? doc.name ?? "Unknown";
    const url = doc.urls?.[0]?.url ?? "";

    // Inbound references
    const inbound: { id: string; name: string; url: string; documentType: string }[] = [];
    if (!refResult.isError) {
      const refData = extractChainedResult(refResult);
      const refs: any[] = refData?.items ?? (Array.isArray(refData) ? refData : []);
      for (const ref of refs) {
        inbound.push({
          id: ref.id ?? "",
          name: ref.name ?? ref.variants?.[0]?.name ?? "Unknown",
          url: ref.urls?.[0]?.url ?? ref.url ?? "",
          documentType: ref.documentType?.alias ?? ref.contentType?.alias ?? "",
        });
      }
    }

    // Outbound references
    const values: any[] = doc.values ?? [];
    const links = extractLinksFromValues(values);

    const internalPages: { id: string; name: string; url: string; documentType: string }[] = [];
    const media: { id: string; name: string; mediaType: string }[] = [];

    const candidateIds = links.contentIds.filter((cid) => cid !== id.toLowerCase());

    await Promise.all(
      candidateIds.map(async (refId) => {
        try {
          const docRes = await mcpClientManager.callTool("cms", "get-document-by-id", { id: refId });
          if (!docRes.isError) {
            const refDoc = extractChainedResult(docRes);
            const refVariant = refDoc.variants?.[0] ?? {};
            internalPages.push({
              id: refId,
              name: refVariant.name ?? refDoc.name ?? "Unknown",
              url: refDoc.urls?.[0]?.url ?? "",
              documentType: refDoc.documentType?.alias ?? "",
            });
            return;
          }
        } catch {
          // Not a document
        }

        try {
          const mediaRes = await mcpClientManager.callTool("cms", "get-media-by-id", { id: refId });
          if (!mediaRes.isError) {
            const refMedia = extractChainedResult(mediaRes);
            media.push({
              id: refId,
              name: refMedia.variants?.[0]?.name ?? refMedia.name ?? "Unknown",
              mediaType: refMedia.mediaType?.alias ?? refMedia.contentTypeAlias ?? "",
            });
          }
        } catch {
          // Neither document nor media
        }
      })
    );

    return createToolResult({
      id,
      name,
      url,
      inbound,
      outbound: {
        internalPages,
        media,
        externalUrls: links.externalUrls,
      },
      summary: {
        inboundCount: inbound.length,
        outboundInternalCount: internalPages.length,
        outboundMediaCount: media.length,
        outboundExternalCount: links.externalUrls.length,
        totalConnections: inbound.length + internalPages.length + media.length + links.externalUrls.length,
      },
    });
  },
};

export default withStandardDecorators(tool);
```

- [ ] **Step 2: Add import to relationships/index.ts**

Add import:
```typescript
import reportRelationshipMapTool from "./get/report-relationship-map.js";
```

Add to tools array:
```typescript
    reportRelationshipMapTool,
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/umbraco-api/tools/relationships/get/report-relationship-map.ts src/umbraco-api/tools/relationships/index.ts
git commit -m "feat: add report-relationship-map tool"
```

---

### Task 6: Create report-external-links tool

**Files:**
- Create: `src/umbraco-api/tools/relationships/get/report-external-links.ts`
- Modify: `src/umbraco-api/tools/relationships/index.ts` (add import and registration)

- [ ] **Step 1: Create the tool**

```typescript
// src/umbraco-api/tools/relationships/get/report-external-links.ts
import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { walkContentTree } from "../../helpers/tree-walker.js";
import { extractLinksFromValues } from "../../helpers/link-extractor.js";

const inputSchema = {
  parentId: z.string().uuid().optional().describe("Scope to a subtree by parent page ID. Omit to scan root-level pages."),
  take: z.number().optional().default(50).describe("Number of domains to return (default 50)"),
  skip: z.number().optional().default(0).describe("Number of domains to skip for pagination (default 0)"),
};

const outputSchema = z.object({
  byDomain: z.array(
    z.object({
      domain: z.string(),
      urls: z.array(
        z.object({
          url: z.string(),
          foundOn: z.array(
            z.object({
              pageId: z.string(),
              pageName: z.string(),
              pageUrl: z.string(),
            })
          ),
        })
      ),
      urlCount: z.number(),
    })
  ).describe("External URLs grouped by domain"),
  totalUrls: z.number().describe("Total number of unique external URLs found"),
  totalDomains: z.number().describe("Total number of unique domains found"),
  scannedPages: z.number().describe("Total number of pages scanned"),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "report-external-links",
  description: "Inventory all external URLs across a section of the site, grouped by domain. Useful for auditing third-party dependencies, finding outdated external links, or understanding integration points. Scans up to 100 pages per call.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ parentId, take, skip }) => {
    const pages = await walkContentTree({ parentId, scanLimit: 100 });

    // Map: url -> { domain, pages[] }
    const urlMap = new Map<string, { domain: string; pages: { pageId: string; pageName: string; pageUrl: string }[] }>();

    for (const page of pages) {
      const links = extractLinksFromValues(page.values);

      for (const ext of links.externalUrls) {
        const existing = urlMap.get(ext.url);
        const pageRef = { pageId: page.id, pageName: page.name, pageUrl: page.url };
        if (existing) {
          existing.pages.push(pageRef);
        } else {
          urlMap.set(ext.url, { domain: ext.domain, pages: [pageRef] });
        }
      }
    }

    // Group by domain
    const domainMap = new Map<string, { url: string; foundOn: { pageId: string; pageName: string; pageUrl: string }[] }[]>();

    for (const [url, data] of urlMap.entries()) {
      const existing = domainMap.get(data.domain);
      const entry = { url, foundOn: data.pages };
      if (existing) {
        existing.push(entry);
      } else {
        domainMap.set(data.domain, [entry]);
      }
    }

    // Build output sorted by URL count descending
    const allDomains = Array.from(domainMap.entries())
      .map(([domain, urls]) => ({
        domain,
        urls,
        urlCount: urls.length,
      }))
      .sort((a, b) => b.urlCount - a.urlCount);

    const totalUrls = urlMap.size;
    const totalDomains = allDomains.length;
    const paginated = allDomains.slice(skip, skip + take);

    return createToolResult({
      byDomain: paginated,
      totalUrls,
      totalDomains,
      scannedPages: pages.length,
    });
  },
};

export default withStandardDecorators(tool);
```

- [ ] **Step 2: Add import to relationships/index.ts**

Add import:
```typescript
import reportExternalLinksTool from "./get/report-external-links.js";
```

Add to tools array:
```typescript
    reportExternalLinksTool,
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/umbraco-api/tools/relationships/get/report-external-links.ts src/umbraco-api/tools/relationships/index.ts
git commit -m "feat: add report-external-links tool"
```

---

### Task 7: Update existing tests for migrated tools

**Files:**
- Modify: `src/umbraco-api/tools/media-health/__tests__/media-health.test.ts`
- Modify: `src/umbraco-api/tools/site-structure/__tests__/site-structure.test.ts`

The moved tools' tests need to be removed from the old test files and added to the new relationships test file (Task 8).

- [ ] **Step 1: Update media-health.test.ts**

Remove the imports for `reportUnusedMediaTool` and `reportContentReferencesTool`. Remove the `report-unused-media`, `report-content-references (document)`, and `report-content-references (media)` describe blocks. Keep only the `report-large-media` test.

The updated file should import only:
```typescript
import reportLargeMediaTool from "../get/report-large-media.js";
import listMediaChildrenTool from "../../media/get/list-media-children.js";
```

The `beforeAll` should only fetch `testMediaId` (no `testPageId` needed for just report-large-media).

Update the `beforeAll` to:
```typescript
  beforeAll(async () => {
    try {
      const mediaResult = await listMediaChildrenTool.handler(
        { parentId: undefined, take: 5, skip: 0 },
        extra,
      );

      const mediaData = getStructuredContent(mediaResult) as any;

      if (!mediaResult.isError && mediaData?.items?.length > 0) {
        cmsAvailable = true;
      }
    } catch {
      console.warn("CMS not available — media-health integration tests will be skipped");
    }
  }, 60000);
```

Remove the `testPageId` and `testMediaId` variables (keep only `cmsAvailable`).

Keep only the `report-large-media` describe block.

- [ ] **Step 2: Update site-structure.test.ts**

Read the current file first. Remove the import for `reportOrphanPagesTool` and its describe block. Keep the other tests (report-site-tree-summary, report-deep-pages).

- [ ] **Step 3: Verify tests pass**

Run: `npm test`
Expected: All tests pass (or skip if CMS unavailable).

- [ ] **Step 4: Commit**

```bash
git add src/umbraco-api/tools/media-health/__tests__/media-health.test.ts src/umbraco-api/tools/site-structure/__tests__/site-structure.test.ts
git commit -m "test: update media-health and site-structure tests after tool migration"
```

---

### Task 8: Create integration tests for the relationships collection

**Files:**
- Create: `src/umbraco-api/tools/relationships/__tests__/relationships.test.ts`

- [ ] **Step 1: Create the integration test file**

```typescript
// src/umbraco-api/tools/relationships/__tests__/relationships.test.ts

/**
 * Relationships Collection Integration Tests
 *
 * Tests for migrated tools (report-content-references, report-orphan-pages, report-unused-media)
 * and new tools (report-outbound-links, report-most-referenced, report-relationship-map, report-external-links).
 * Runs against a real Umbraco instance via the chained @umbraco-cms/mcp-dev MCP server.
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from "@jest/globals";
import {
  setupTestEnvironment,
  setupElicitationMock,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

import reportContentReferencesTool from "../get/report-content-references.js";
import reportOrphanPagesTool from "../get/report-orphan-pages.js";
import reportUnusedMediaTool from "../get/report-unused-media.js";
import reportOutboundLinksTool from "../get/report-outbound-links.js";
import reportMostReferencedTool from "../get/report-most-referenced.js";
import reportRelationshipMapTool from "../get/report-relationship-map.js";
import reportExternalLinksTool from "../get/report-external-links.js";
import listChildrenTool from "../../content/get/list-children.js";
import listMediaChildrenTool from "../../media/get/list-media-children.js";

const elicitation = setupElicitationMock(jest.fn as any);

describe("Relationships Collection", () => {
  setupTestEnvironment();

  const extra = createMockRequestHandlerExtra();
  let cmsAvailable = false;
  let testPageId: string;
  let testMediaId: string;

  beforeAll(async () => {
    try {
      const [pageResult, mediaResult] = await Promise.all([
        listChildrenTool.handler({ parentId: undefined, take: 5, skip: 0 }, extra),
        listMediaChildrenTool.handler({ parentId: undefined, take: 5, skip: 0 }, extra),
      ]);

      const pageData = getStructuredContent(pageResult) as any;
      const mediaData = getStructuredContent(mediaResult) as any;

      if (!pageResult.isError && pageData?.items?.length > 0) {
        cmsAvailable = true;
        testPageId = pageData.items[0].id;
      }

      if (!mediaResult.isError && mediaData?.items?.length > 0) {
        testMediaId = mediaData.items[0].id;
      }
    } catch {
      console.warn("CMS not available — relationships integration tests will be skipped");
    }
  }, 60000);

  afterAll(() => {
    elicitation.cleanup();
  }, 30000);

  beforeEach(() => {
    elicitation.reset();
  });

  // --- Migrated tools ---

  describe("report-content-references (document)", () => {
    it("should return referencedBy array and referenceCount for a known page", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await reportContentReferencesTool.handler(
        { id: testPageId, type: "document" },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testPageId);
      expect(data.referencedBy).toBeInstanceOf(Array);
      expect(data.referenceCount).toEqual(expect.any(Number));
    }, 30000);
  });

  describe("report-content-references (media)", () => {
    it("should return referencedBy and referenceCount for a media item", async () => {
      if (!cmsAvailable || !testMediaId) return;

      const result = await reportContentReferencesTool.handler(
        { id: testMediaId, type: "media" },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.referencedBy).toBeInstanceOf(Array);
      expect(data.referenceCount).toEqual(expect.any(Number));
    }, 30000);
  });

  describe("report-orphan-pages", () => {
    it("should return items array with scannedPages count", async () => {
      if (!cmsAvailable) return;

      const result = await reportOrphanPagesTool.handler(
        { parentId: undefined, take: 10, skip: 0 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.scannedPages).toEqual(expect.any(Number));
      expect(data.total).toEqual(expect.any(Number));
    }, 60000);
  });

  describe("report-unused-media", () => {
    it("should return items with totalFileSize and scannedItems", async () => {
      if (!cmsAvailable) return;

      const result = await reportUnusedMediaTool.handler(
        { parentId: undefined, take: 10, skip: 0 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.totalFileSize).toEqual(expect.any(Number));
      expect(data.scannedItems).toEqual(expect.any(Number));
    }, 60000);
  });

  // --- New tools ---

  describe("report-outbound-links", () => {
    it("should return internalPages, media, and externalUrls arrays", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await reportOutboundLinksTool.handler(
        { id: testPageId },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testPageId);
      expect(data.internalPages).toBeInstanceOf(Array);
      expect(data.media).toBeInstanceOf(Array);
      expect(data.externalUrls).toBeInstanceOf(Array);
      expect(data.summary).toBeDefined();
      expect(data.summary.totalLinks).toEqual(expect.any(Number));
    }, 60000);
  });

  describe("report-most-referenced", () => {
    it("should return items sorted by referenceCount", async () => {
      if (!cmsAvailable) return;

      const result = await reportMostReferencedTool.handler(
        { parentId: undefined, take: 10, skip: 0, type: "document" },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.scannedItems).toEqual(expect.any(Number));
      expect(data.total).toEqual(expect.any(Number));

      // Verify descending sort
      if (data.items.length > 1) {
        expect(data.items[0].referenceCount).toBeGreaterThanOrEqual(data.items[1].referenceCount);
      }
    }, 60000);
  });

  describe("report-relationship-map", () => {
    it("should return inbound and outbound sections", async () => {
      if (!cmsAvailable || !testPageId) return;

      const result = await reportRelationshipMapTool.handler(
        { id: testPageId },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.id).toBe(testPageId);
      expect(data.inbound).toBeInstanceOf(Array);
      expect(data.outbound).toBeDefined();
      expect(data.outbound.internalPages).toBeInstanceOf(Array);
      expect(data.outbound.media).toBeInstanceOf(Array);
      expect(data.outbound.externalUrls).toBeInstanceOf(Array);
      expect(data.summary).toBeDefined();
      expect(data.summary.totalConnections).toEqual(expect.any(Number));
    }, 60000);
  });

  describe("report-external-links", () => {
    it("should return byDomain array with URL grouping", async () => {
      if (!cmsAvailable) return;

      const result = await reportExternalLinksTool.handler(
        { parentId: undefined, take: 10, skip: 0 },
        extra,
      );

      expect(result.isError).toBeFalsy();
      const data = getStructuredContent(result) as any;
      expect(data).toBeDefined();
      expect(data.byDomain).toBeInstanceOf(Array);
      expect(data.totalUrls).toEqual(expect.any(Number));
      expect(data.totalDomains).toEqual(expect.any(Number));
      expect(data.scannedPages).toEqual(expect.any(Number));

      if (data.byDomain.length > 0) {
        expect(data.byDomain[0]).toHaveProperty("domain");
        expect(data.byDomain[0]).toHaveProperty("urls");
        expect(data.byDomain[0]).toHaveProperty("urlCount");
      }
    }, 60000);
  });
});
```

- [ ] **Step 2: Verify tests compile and run**

Run: `npm run compile`
Expected: No errors.

Run: `npm test -- --testPathPattern=src/umbraco-api/tools/relationships/__tests__/relationships.test.ts`
Expected: Tests pass (or skip gracefully if CMS unavailable).

- [ ] **Step 3: Commit**

```bash
git add src/umbraco-api/tools/relationships/__tests__/relationships.test.ts
git commit -m "test: add relationships collection integration tests"
```

---

### Task 9: Create eval tests and update existing eval files

**Files:**
- Create: `tests/evals/relationships-workflows.test.ts`
- Modify: All existing eval files in `tests/evals/` to add new tool names to their `allTools` arrays

- [ ] **Step 1: Create the eval test file**

```typescript
// tests/evals/relationships-workflows.test.ts

/**
 * Relationships Workflow Eval Tests
 *
 * Tests covering content relationship discovery, outbound link analysis,
 * bidirectional relationship mapping, and external URL inventory.
 * All tests are read-only.
 */

import { describe, it } from "@jest/globals";
import {
  runScenarioTest,
  setupConsoleMock,
  getDefaultTimeoutMs,
} from "@umbraco-cms/mcp-server-sdk/evals";

const allTools = [
  // Content
  "search-content",
  "get-page",
  "list-children",
  "list-document-types",
  "inspect-blocks",
  "create-page",
  "edit-page",
  "edit-block",
  "delete-page",
  // Publishing
  "publish-page",
  "unpublish-page",
  // Versioning
  "list-versions",
  "rollback-page",
  // Media
  "search-media",
  "list-media-children",
  "get-media",
  "list-media-types",
  "upload-media",
  "create-media-folder",
  "move-media",
  "delete-media",
  "restore-media",
  // Blueprints
  "list-blueprints",
  "get-blueprint",
  "create-blueprint",
  // Languages
  "list-languages",
  "get-language",
  "create-language",
  "update-language",
  "delete-language",
  // Translation
  "create-variant",
  "copy-variant",
  "list-untranslated",
  // Dictionary
  "list-dictionary",
  "search-dictionary",
  "get-dictionary",
  "create-dictionary",
  "update-dictionary",
  "move-dictionary",
  // Tags
  "list-tags",
  // Content Health
  "audit-page-seo",
  "audit-page-content",
  "report-empty-fields",
  "report-short-content",
  "report-media-missing-alt",
  // Content Reporting
  "report-stale-content",
  "report-unpublished",
  "report-recently-changed",
  "report-content-by-type",
  "report-translation-coverage",
  // Site Structure
  "report-site-tree-summary",
  "report-deep-pages",
  // Media Health
  "report-large-media",
  // Relationships
  "report-content-references",
  "report-orphan-pages",
  "report-unused-media",
  "report-outbound-links",
  "report-most-referenced",
  "report-relationship-map",
  "report-external-links",
  // Bulk Operations
  "bulk-publish",
  "bulk-unpublish",
  "bulk-schedule-publish",
  "bulk-set-property",
  "bulk-move",
  // Members
  "search-members",
  "get-member",
  "list-member-types",
  "create-member",
  "update-member",
  "delete-member",
  // Member Groups
  "list-member-groups",
  "create-member-group",
  "delete-member-group",
  // Member Reporting
  "report-member-count",
  "report-members-by-group",
  "report-member-activity",
  // Scheduling
  "get-publish-status",
  "list-scheduled-content",
  "schedule-publish",
  "cancel-schedule",
  // Redirects
  "list-redirects",
  "get-redirect",
  "delete-redirect",
  "get-redirect-status",
];

describe("Relationships Workflows", () => {
  setupConsoleMock();

  const timeout = getDefaultTimeoutMs();

  it(
    "editor views outbound links from a page",
    runScenarioTest({
      prompt:
        "Find the homepage using search-content or list-children, then use report-outbound-links to see what it links to — internal pages, media, and external URLs.",
      tools: allTools,
      requiredTools: ["report-outbound-links"],
      successPattern: /link|reference|media|external|internal|outbound/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor checks which content is most referenced",
    runScenarioTest({
      prompt:
        "Use report-most-referenced to find the most-referenced content pages on the site. Show me which pages are referenced the most.",
      tools: allTools,
      requiredTools: ["report-most-referenced"],
      successPattern: /reference|referenced|count|most|critical/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor maps all relationships for a page",
    runScenarioTest({
      prompt:
        "Find the homepage, then use report-relationship-map to show me everything that references it and everything it references.",
      tools: allTools,
      requiredTools: ["report-relationship-map"],
      successPattern: /inbound|outbound|relationship|connection|reference/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor audits external links across the site",
    runScenarioTest({
      prompt:
        "Use report-external-links to inventory all external URLs across the site. Group them by domain.",
      tools: allTools,
      requiredTools: ["report-external-links"],
      successPattern: /external|domain|url|link|inventory/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor checks impact before deleting a media item",
    runScenarioTest({
      prompt:
        "I want to delete a media item. First use list-media-children to find a media item, then use report-content-references with type 'media' to check if anything references it. Tell me if it's safe to delete.",
      tools: allTools,
      requiredTools: ["report-content-references"],
      successPattern: /reference|safe|delete|used|referenced/i,
      verbose: true,
    }),
    timeout
  );
});
```

- [ ] **Step 2: Update all existing eval files' allTools arrays**

In every eval file under `tests/evals/`, the `allTools` array needs updating:

1. Move the three migrated tools from their old sections to a new "Relationships" section
2. Add the 4 new tool names to the "Relationships" section
3. Remove `report-orphan-pages` from "Site Structure" section
4. Remove `report-unused-media` and `report-content-references` from "Media Health" section

The changes to each eval file's `allTools` array:

**Remove** from Site Structure section:
```
  "report-orphan-pages",
```

**Remove** from Media Health section:
```
  "report-unused-media",
  "report-content-references",
```

**Add** after Media Health section (or after `"report-large-media"`):
```
  // Relationships
  "report-content-references",
  "report-orphan-pages",
  "report-unused-media",
  "report-outbound-links",
  "report-most-referenced",
  "report-relationship-map",
  "report-external-links",
```

Apply this change to all eval files:
- `tests/evals/media-workflows.test.ts`
- `tests/evals/advanced-workflows.test.ts`
- `tests/evals/read-workflows.test.ts`
- `tests/evals/scheduling-redirects-workflows.test.ts`
- `tests/evals/member-workflows.test.ts`
- `tests/evals/translation-workflows.test.ts`
- `tests/evals/bulk-workflows.test.ts`
- `tests/evals/write-workflows.test.ts`
- `tests/evals/cross-collection-workflows.test.ts`
- `tests/evals/content-health-workflows.test.ts`

- [ ] **Step 3: Verify compilation**

Run: `npm run compile`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add tests/evals/relationships-workflows.test.ts tests/evals/*.test.ts
git commit -m "test: add relationships eval tests and update allTools arrays"
```

---

### Task 10: Final verification

- [ ] **Step 1: Full compilation check**

Run: `npm run compile`
Expected: Zero errors.

- [ ] **Step 2: Run all unit/integration tests**

Run: `npm test`
Expected: All tests pass (or skip gracefully if CMS unavailable).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 4: Verify tool count**

The `relationships` collection should register 7 tools. Check the console output shows the correct total tool count (previous count + 4 new tools, since 3 were moved not added).

- [ ] **Step 5: Final commit (if any uncommitted changes)**

```bash
git status
# If clean, no commit needed
# If changes exist:
git add -A
git commit -m "chore: final verification fixes for relationships collection"
```
