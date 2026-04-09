# bulk-set-block-property Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a tool that bulk-updates block properties across multiple pages, targeting blocks by element type.

**Architecture:** Combines the bulk-handler pattern (validate, fetch, confirm, execute sequentially, fail-fast) with inspect-blocks detection logic to find matching blocks, then delegates to `update-block-property` chained call. Lives in the existing `bulk-operations` collection.

**Tech Stack:** TypeScript, Zod, @umbraco-cms/mcp-server-sdk, chained MCP calls to @umbraco-cms/mcp-dev

---

### Task 1: Create the bulk-set-block-property tool

**Files:**
- Create: `src/umbraco-api/tools/bulk-operations/post/bulk-set-block-property.ts`
- Modify: `src/umbraco-api/tools/bulk-operations/index.ts`

- [ ] **Step 1: Create the tool file**

Create `src/umbraco-api/tools/bulk-operations/post/bulk-set-block-property.ts`:

```typescript
import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition, confirmAction, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import {
  validateBulkIds,
  fetchBulkItemDetails,
  buildBulkOutput,
  type BulkOperationOutput,
  type BulkItemDetail,
} from "../../helpers/bulk-handler.js";

const inputSchema = {
  ids: z.array(z.string().uuid()).min(1).max(10).describe("The IDs of the pages to update (max 10)"),
  contentTypeKey: z.string().uuid().describe("The block element type key to target. Use inspect-blocks to find this."),
  propertyAlias: z.string().describe("The document property alias containing the blocks (e.g. 'contentRows'). Use inspect-blocks to find this."),
  values: z.array(z.object({
    alias: z.string().describe("The property alias within the block"),
    value: z.any().describe("The new value for the property"),
  })).min(1).describe("Properties to update on every matching block"),
  culture: z.string().nullable().optional().describe("Culture code if the document property is variant"),
  segment: z.string().nullable().optional().describe("Segment if the document property is variant"),
};

const outputSchema = z.object({
  message: z.string(),
  results: z.array(z.object({
    id: z.string(),
    name: z.string(),
    success: z.boolean(),
    blocksUpdated: z.number(),
    previousVersionId: z.string().optional(),
    error: z.string().optional(),
  })),
  successCount: z.number(),
  failureCount: z.number(),
  skippedCount: z.number(),
  totalBlocksUpdated: z.number(),
});

interface BlockMatch {
  contentKey: string;
}

function isBlockListOrGridValue(value: any): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Array.isArray(value.contentData)
  );
}

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

function findMatchingBlocks(doc: any, propertyAlias: string, contentTypeKey: string): BlockMatch[] {
  const allValues: Array<{ alias: string; value: any }> = doc.values ?? [];
  const prop = allValues.find((v: any) => v.alias === propertyAlias);
  if (!prop) return [];

  let contentData: any[] = [];
  if (isBlockListOrGridValue(prop.value)) {
    contentData = prop.value.contentData;
  } else if (isRteWithBlocks(prop.value)) {
    contentData = prop.value.blocks.contentData;
  }

  return contentData
    .filter((block: any) => block.contentTypeKey === contentTypeKey)
    .map((block: any) => ({ contentKey: block.key ?? "" }))
    .filter((b) => b.contentKey !== "");
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "bulk-set-block-property",
  description: "Update properties on blocks of a specific type across multiple pages (max 10). Targets all blocks matching the given element type within the specified property. Use inspect-blocks first on a sample page to find contentTypeKey and propertyAlias. Changes are saved but NOT published. You will be asked to confirm before updating.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ ids, contentTypeKey, propertyAlias, values, culture, segment }, extra) => {
    // 1. Validate cap
    const validationError = validateBulkIds(ids);
    if (validationError) return createToolResult({ ...validationError, totalBlocksUpdated: 0 } as any);

    // 2. Fetch details + find matching blocks per page
    const items = await fetchBulkItemDetails(ids);
    if (items.length === 0) {
      return createToolResult({
        message: "Could not fetch page details",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
        totalBlocksUpdated: 0,
      });
    }

    // Inspect each page for matching blocks
    const pageBlocks = new Map<string, BlockMatch[]>();
    for (const item of items) {
      const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id: item.id });
      if (docResult.isError) {
        pageBlocks.set(item.id, []);
        continue;
      }
      const doc = extractChainedResult(docResult);
      pageBlocks.set(item.id, findMatchingBlocks(doc, propertyAlias, contentTypeKey));
    }

    const totalBlocks = Array.from(pageBlocks.values()).reduce((sum, blocks) => sum + blocks.length, 0);
    const pagesWithBlocks = items.filter(i => (pageBlocks.get(i.id)?.length ?? 0) > 0);

    // 3. Confirm
    const fieldNames = values.map((v) => v.alias);
    const nameList = items.map(i => {
      const count = pageBlocks.get(i.id)?.length ?? 0;
      return `- ${i.name} (${count} block${count !== 1 ? "s" : ""})`;
    }).join("\n");
    const message = `Update ${fieldNames.length} field(s) on ${totalBlocks} block(s) across ${pagesWithBlocks.length} page(s):\n${nameList}\nFields: ${fieldNames.join(", ")}\nChanges will be saved but not published.`;

    if (!await confirmAction(extra, message, { title: "Confirm bulk block property update", defaultValue: true })) {
      return createToolResult({
        message: "Cancelled",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
        totalBlocksUpdated: 0,
      });
    }

    // 4. Execute sequentially, fail-fast
    const results: Array<{
      id: string;
      name: string;
      success: boolean;
      blocksUpdated: number;
      previousVersionId?: string;
      error?: string;
    }> = [];
    let stopped = false;
    let totalBlocksUpdated = 0;

    for (const item of items) {
      if (stopped) {
        results.push({
          id: item.id,
          name: item.name,
          success: false,
          blocksUpdated: 0,
          previousVersionId: item.currentVersionId || undefined,
          error: "Skipped — previous item failed",
        });
        continue;
      }

      const blocks = pageBlocks.get(item.id) ?? [];
      if (blocks.length === 0) {
        results.push({
          id: item.id,
          name: item.name,
          success: true,
          blocksUpdated: 0,
          previousVersionId: item.currentVersionId || undefined,
        });
        continue;
      }

      const updateResult = await mcpClientManager.callTool("cms", "update-block-property", {
        documentId: item.id,
        propertyAlias,
        culture: culture ?? null,
        segment: segment ?? null,
        updates: blocks.map(block => ({
          contentKey: block.contentKey,
          blockType: "content",
          properties: values.map(v => ({ alias: v.alias, value: v.value })),
        })),
      });

      if (updateResult.isError) {
        const errorDetail = extractChainedResult(updateResult)?.detail ?? "Block update failed";
        results.push({
          id: item.id,
          name: item.name,
          success: false,
          blocksUpdated: 0,
          previousVersionId: item.currentVersionId || undefined,
          error: typeof errorDetail === "string" ? errorDetail : "Block update failed",
        });
        stopped = true;
      } else {
        totalBlocksUpdated += blocks.length;
        results.push({
          id: item.id,
          name: item.name,
          success: true,
          blocksUpdated: blocks.length,
          previousVersionId: item.currentVersionId || undefined,
        });
      }
    }

    // 5. Return summary
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success && r.error !== "Skipped — previous item failed").length;
    const skippedCount = results.filter(r => r.error === "Skipped — previous item failed").length;

    return createToolResult({
      message: `Updated ${totalBlocksUpdated} block(s) across ${successCount} of ${results.length} pages`,
      results,
      successCount,
      failureCount,
      skippedCount,
      totalBlocksUpdated,
    });
  },
};

export default withStandardDecorators(tool);
```

- [ ] **Step 2: Register in the collection index**

In `src/umbraco-api/tools/bulk-operations/index.ts`, add the import and include in the tools array:

```typescript
import bulkSetBlockPropertyTool from "./post/bulk-set-block-property.js";
```

Add to the tools array:

```typescript
tools: () => [bulkPublishTool, bulkUnpublishTool, bulkSchedulePublishTool, bulkSetPropertyTool, bulkMoveTool, bulkSetBlockPropertyTool],
```

- [ ] **Step 3: Compile**

Run: `npm run compile`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/umbraco-api/tools/bulk-operations/post/bulk-set-block-property.ts src/umbraco-api/tools/bulk-operations/index.ts
git commit -m "feat: add bulk-set-block-property tool"
```

---

### Task 2: Add integration tests

**Files:**
- Modify: `src/umbraco-api/tools/bulk-operations/__tests__/bulk-operations.test.ts`

- [ ] **Step 1: Add import and tests**

Add to the imports at the top of `bulk-operations.test.ts`:

```typescript
import bulkSetBlockPropertyTool from "../post/bulk-set-block-property.js";
import inspectBlocksTool from "../../content/get/inspect-blocks.js";
```

Add a new `FAKE_CONTENT_TYPE_KEY` constant alongside the existing fakes:

```typescript
const FAKE_CONTENT_TYPE_KEY = "00000000-0000-0000-0000-000000000003";
```

Add the following test sections inside the main `describe` block, after the existing `bulk-move` tests:

**Cap validation test** (add after the existing cap validation section):

```typescript
describe("bulk-set-block-property — cap validation", () => {
  it("should return error when more than 10 IDs are provided", async () => {
    const tooManyIds = Array.from(
      { length: 11 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
    );

    const result = await bulkSetBlockPropertyTool.handler(
      {
        ids: tooManyIds,
        contentTypeKey: FAKE_CONTENT_TYPE_KEY,
        propertyAlias: "contentRows",
        values: [{ alias: "caption", value: "Test" }],
        culture: undefined,
        segment: undefined,
      },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data.message).toContain("10");
  }, 10000);
});
```

**Happy path test** (add after the existing happy path section):

```typescript
describe("bulk-set-block-property", () => {
  it("should update block properties on pages with matching blocks", async () => {
    if (!cmsAvailable || !firstRootPageId) return;

    // First, inspect the page to find a block with its contentTypeKey and propertyAlias
    const inspectResult = await inspectBlocksTool.handler(
      { id: firstRootPageId, propertyAlias: undefined },
      extra,
    );
    const inspectData = getStructuredContent(inspectResult) as any;

    if (!inspectData?.blockProperties?.length || !inspectData.blockProperties[0]?.blocks?.length) {
      console.warn("Skipping bulk-set-block-property test: no blocks found on first root page");
      return;
    }

    const firstBlockProp = inspectData.blockProperties[0];
    const firstBlock = firstBlockProp.blocks[0];

    // Skip if the block has no properties to update
    if (!firstBlock.properties?.length) {
      console.warn("Skipping bulk-set-block-property test: block has no properties");
      return;
    }

    const targetPropAlias = firstBlock.properties[0].alias;
    const originalValue = firstBlock.properties[0].value;

    const result = await bulkSetBlockPropertyTool.handler(
      {
        ids: [firstRootPageId],
        contentTypeKey: firstBlock.contentTypeKey,
        propertyAlias: firstBlockProp.propertyAlias,
        values: [{ alias: targetPropAlias, value: originalValue }],
        culture: undefined,
        segment: undefined,
      },
      extra,
    );

    if (result.isError) {
      console.warn("Skipping bulk-set-block-property assertions: CMS returned error");
      return;
    }

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results.length).toBe(1);
    expect(data.results[0].success).toBe(true);
    expect(data.results[0].blocksUpdated).toBeGreaterThanOrEqual(1);
    expect(data.totalBlocksUpdated).toBeGreaterThanOrEqual(1);
    expect(data.successCount).toBe(1);
  }, 60000);

  it("should return success with 0 blocks updated when no blocks match", async () => {
    if (!cmsAvailable || !firstRootPageId) return;

    const result = await bulkSetBlockPropertyTool.handler(
      {
        ids: [firstRootPageId],
        contentTypeKey: FAKE_CONTENT_TYPE_KEY,
        propertyAlias: "contentRows",
        values: [{ alias: "caption", value: "Test" }],
        culture: undefined,
        segment: undefined,
      },
      extra,
    );

    if (result.isError) {
      console.warn("Skipping bulk-set-block-property no-match assertions: CMS returned error");
      return;
    }

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.results).toBeInstanceOf(Array);
    expect(data.results[0].success).toBe(true);
    expect(data.results[0].blocksUpdated).toBe(0);
    expect(data.totalBlocksUpdated).toBe(0);
  }, 30000);
});
```

**Elicitation rejection test** (add inside the existing "elicitation rejection" describe block):

```typescript
it("should cancel bulk-set-block-property when elicitation is rejected", async () => {
  if (!cmsAvailable || !firstRootPageId) return;

  elicitation.rejectAll();

  const result = await bulkSetBlockPropertyTool.handler(
    {
      ids: [firstRootPageId],
      contentTypeKey: FAKE_CONTENT_TYPE_KEY,
      propertyAlias: "contentRows",
      values: [{ alias: "caption", value: "Test" }],
      culture: undefined,
      segment: undefined,
    },
    extra,
  );

  const data = getStructuredContent(result) as any;
  expect(data?.message?.includes("Cancelled") || result.isError).toBe(true);
}, 30000);
```

- [ ] **Step 2: Compile**

Run: `npm run compile`
Expected: No errors

- [ ] **Step 3: Run the tests**

Run: `npm test -- --testPathPattern=src/umbraco-api/tools/bulk-operations/__tests__/bulk-operations.test.ts`
Expected: All tests pass (CMS-dependent tests skip gracefully if CMS unavailable)

- [ ] **Step 4: Commit**

```bash
git add src/umbraco-api/tools/bulk-operations/__tests__/bulk-operations.test.ts
git commit -m "test: add bulk-set-block-property integration tests"
```

---

### Task 3: Add eval test

**Files:**
- Modify: whichever eval file covers bulk operations (check `tests/evals/` for existing bulk eval), or create `tests/evals/bulk-set-block-property.test.ts`

- [ ] **Step 1: Find the existing bulk evals file**

Run: `ls tests/evals/` to find the right file. If there is a `bulk-operations.test.ts`, add to it. Otherwise create a new file.

- [ ] **Step 2: Add eval scenario**

Add a scenario using `runScenarioTest`:

```typescript
it("should use bulk-set-block-property to update blocks across pages", async () => {
  await runScenarioTest({
    prompt: "Find blog posts that have image blocks and update the caption property on all image blocks to say 'Updated caption'. Use inspect-blocks on one page first to find the block type, then use bulk-set-block-property.",
    tools: allTools,
    requiredTools: ["inspect-blocks", "bulk-set-block-property"],
    successPattern: /block|updated|caption/i,
  });
}, 120000);
```

- [ ] **Step 3: Compile**

Run: `npm run compile`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add tests/evals/
git commit -m "test: add bulk-set-block-property eval scenario"
```
