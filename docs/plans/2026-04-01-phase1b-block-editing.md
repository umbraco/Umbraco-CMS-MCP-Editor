# Phase 1b: Block Editing Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give editors tools to understand and edit block-based content (BlockList, BlockGrid, RTE blocks) without needing to know the underlying data model.

**Architecture:** Three changes — switch `edit-page` to delegate to `update-document-properties` (validated property patch), add `inspect-blocks` (read-only block structure viewer), add `edit-block` (targeted block property updates via `update-block-property`). All delegate to existing dev MCP tools.

**Tech Stack:** TypeScript, Zod, @umbraco-cms/mcp-server-sdk, chained dev MCP via mcpClientManager

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/umbraco-api/tools/content/put/edit-page.ts` | Modify | Switch from `update-document` to `update-document-properties` |
| `src/umbraco-api/tools/content/get/inspect-blocks.ts` | Create | Read-only block structure viewer |
| `src/umbraco-api/tools/content/put/edit-block.ts` | Create | Block property updates with elicitation |
| `src/umbraco-api/tools/content/get/get-page.ts` | Modify | Summarise block content instead of raw JSON dump |
| `src/umbraco-api/tools/content/index.ts` | Modify | Register new tools |
| `src/umbraco-api/tools/content/__tests__/content.test.ts` | Modify | Add tests for new tools, update edit-page test |
| `tests/evals/content-workflows.test.ts` | Modify | Add evals for block workflows |

---

### Task 1: Switch edit-page to update-document-properties

**Files:**
- Modify: `src/umbraco-api/tools/content/put/edit-page.ts`
- Modify: `src/umbraco-api/tools/content/__tests__/content.test.ts`

The current `edit-page` does a manual read-modify-write against `update-document`. The dev MCP's `update-document-properties` handles this internally with proper validation (alias exists on doc type, culture/segment matches variance flags, value type validation). Switch to it.

- [ ] **Step 1: Rewrite edit-page handler to delegate to update-document-properties**

Replace the entire handler. Remove the manual merge logic (lines 65-84). The new handler:
1. Fetches page name for confirmation (keep existing pattern)
2. Elicits confirmation (keep existing pattern)
3. Calls `update-document-properties` with `{ id, properties: values }`
4. Extracts result and returns shaped response

```typescript
import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "../../extract-chained-result.js";
import { getServerRef } from "../../../server-ref.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to edit"),
  values: z.array(z.object({
    alias: z.string().describe("The property alias"),
    value: z.any().describe("The new property value"),
    culture: z.string().nullable().optional().describe("The culture code for variant content"),
    segment: z.string().nullable().optional().describe("The segment for segmented content"),
  })).describe("Property values to update on the page"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  updatedFields: z.array(z.string()),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "edit-page",
  description: "Update specific fields on a content page. Changes are saved but NOT published. Call get-page first to discover valid property aliases for the page's document type. You will be asked to confirm before updating.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, values }, extra) => {
    // Step 1: Fetch page details for confirmation
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    // Step 2: Elicit confirmation listing field names
    const fieldNames = values.map((v) => v.alias);
    const confirmMessage = `Update ${fieldNames.length} field(s) on "${pageName}": ${fieldNames.join(", ")}? Changes will be saved but not published.`;

    const server = getServerRef();
    const elicitResult = await server.elicitInput(
      {
        message: confirmMessage,
        requestedSchema: {
          type: "object" as const,
          properties: {
            confirm: {
              type: "boolean" as const,
              title: "Confirm edit",
              description: confirmMessage,
              default: true,
            },
          },
        },
      },
      { relatedRequestId: extra?.requestId },
    );

    if (elicitResult.action !== "accept" || !(elicitResult.content as any)?.confirm) {
      return createToolResult({ message: "Edit cancelled", id, name: pageName, updatedFields: [] });
    }

    // Step 3: Delegate to update-document-properties (handles validation + merge internally)
    const updateResult = await mcpClientManager.callTool("cms", "update-document-properties", {
      id,
      properties: values.map(v => ({
        alias: v.alias,
        value: v.value,
        culture: v.culture ?? null,
        segment: v.segment ?? null,
      })),
    });
    if (updateResult.isError) return createToolResultError(updateResult);

    return createToolResult({
      message: `Updated ${fieldNames.length} field(s) on "${pageName}" (saved, not published)`,
      id,
      name: pageName,
      updatedFields: fieldNames,
    });
  },
};

export default withStandardDecorators(tool);
```

- [ ] **Step 2: Run compile and integration tests**

Run: `npm run compile && npm run build && node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=content --runInBand --forceExit`

Expected: Compile clean, edit-page test passes (the test sends `{ alias: "title", value: "Updated Title" }` which `update-document-properties` will validate against the doc type — may return a validation error if the alias doesn't exist, which is correct behaviour).

- [ ] **Step 3: Commit**

```bash
git add src/umbraco-api/tools/content/put/edit-page.ts
git commit -m "refactor: switch edit-page to update-document-properties

Delegates to the dev MCP's validated property patch instead of manual
read-modify-write against update-document. Gets alias validation,
culture/segment validation, and value type validation for free."
```

---

### Task 2: Add inspect-blocks tool

**Files:**
- Create: `src/umbraco-api/tools/content/get/inspect-blocks.ts`
- Modify: `src/umbraco-api/tools/content/index.ts`

This is the "where is my data?" tool. An editor says "show me what's in the hero section" and the LLM calls this to see the block structure — block type names, content keys, property aliases and values — without the raw nested JSON mess.

- [ ] **Step 1: Create inspect-blocks tool**

The tool fetches a page by ID, finds block-based properties (BlockList, BlockGrid, RTE with blocks), and returns a human-readable summary of each block: its type, contentKey, and property values.

```typescript
import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "../../extract-chained-result.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page to inspect"),
  propertyAlias: z.string().optional().describe("Specific property alias to inspect. If omitted, all block-based properties are shown."),
};

const blockPropertySchema = z.object({
  alias: z.string(),
  value: z.any(),
});

const blockSchema = z.object({
  contentKey: z.string().describe("The block's unique key — use this with edit-block"),
  contentTypeKey: z.string(),
  properties: z.array(blockPropertySchema),
});

const blockPropertyGroupSchema = z.object({
  propertyAlias: z.string().describe("The document property containing these blocks"),
  editorAlias: z.string().optional(),
  blocks: z.array(blockSchema),
});

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  blockProperties: z.array(blockPropertyGroupSchema),
});

/**
 * Checks if a value contains block data (BlockList, BlockGrid, or RTE with blocks).
 */
function hasBlockData(value: any): boolean {
  if (!value || typeof value !== "object") return false;
  // BlockList/BlockGrid: { contentData: [], settingsData: [], layout: {} }
  if (Array.isArray(value.contentData)) return value.contentData.length > 0;
  // RTE with blocks: { markup: "...", blocks: { contentData: [], ... } }
  if (value.blocks && Array.isArray(value.blocks.contentData)) return value.blocks.contentData.length > 0;
  return false;
}

/**
 * Extracts block items from a value, handling BlockList/BlockGrid and RTE structures.
 */
function extractBlocks(value: any): Array<{ contentKey: string; contentTypeKey: string; properties: Array<{ alias: string; value: any }> }> {
  const blocks: Array<{ contentKey: string; contentTypeKey: string; properties: Array<{ alias: string; value: any }> }> = [];

  const processContentData = (contentData: any[]) => {
    for (const block of contentData) {
      blocks.push({
        contentKey: block.key ?? block.contentKey ?? "unknown",
        contentTypeKey: block.contentTypeKey ?? "unknown",
        properties: (block.values ?? []).map((v: any) => ({
          alias: v.alias,
          value: v.value,
        })),
      });
    }
  };

  // BlockList/BlockGrid
  if (Array.isArray(value.contentData)) {
    processContentData(value.contentData);
  }
  // RTE with blocks
  if (value.blocks && Array.isArray(value.blocks.contentData)) {
    processContentData(value.blocks.contentData);
  }

  return blocks;
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "inspect-blocks",
  description: "Inspect the block structure of a content page. Shows each block's type, unique key, and property values. Use this to understand how content is structured inside BlockList, BlockGrid, or Rich Text properties before using edit-block to make changes.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id, propertyAlias }) => {
    const result = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (result.isError) return createToolResultError(result);
    const doc = extractChainedResult(result);
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    const allValues = (doc.values ?? []) as any[];
    const blockValues = allValues.filter((v: any) => {
      if (propertyAlias && v.alias !== propertyAlias) return false;
      return hasBlockData(v.value);
    });

    const blockProperties = blockValues.map((v: any) => ({
      propertyAlias: v.alias,
      editorAlias: v.editorAlias ?? undefined,
      blocks: extractBlocks(v.value),
    }));

    return createToolResult({
      id: doc.id,
      name: pageName,
      blockProperties,
    });
  },
};

export default withStandardDecorators(tool);
```

- [ ] **Step 2: Register inspect-blocks in content collection index**

In `src/umbraco-api/tools/content/index.ts`, add import and include in tools array:

```typescript
import inspectBlocksTool from "./get/inspect-blocks.js";

// In tools array:
tools: () => [searchContentTool, getPageTool, listChildrenTool, listDocumentTypesTool, inspectBlocksTool, createPageTool, editPageTool, editBlockTool, deletePageTool],
```

Note: `editBlockTool` will be added in Task 3 — for now just add `inspectBlocksTool`.

- [ ] **Step 3: Compile and build**

Run: `npm run compile && npm run build`

Expected: Clean compile.

- [ ] **Step 4: Commit**

```bash
git add src/umbraco-api/tools/content/get/inspect-blocks.ts src/umbraco-api/tools/content/index.ts
git commit -m "feat: add inspect-blocks tool for block structure discovery

Shows the block structure of a page — block types, content keys, and
property values. Helps editors understand where content lives inside
BlockList, BlockGrid, and Rich Text properties."
```

---

### Task 3: Add edit-block tool

**Files:**
- Create: `src/umbraco-api/tools/content/put/edit-block.ts`
- Modify: `src/umbraco-api/tools/content/index.ts`

This tool delegates to `update-block-property` with elicitation confirmation. The editor says "change the heading in the hero banner" and the LLM uses inspect-blocks to find the contentKey, then edit-block to update it.

- [ ] **Step 1: Create edit-block tool**

```typescript
import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "../../extract-chained-result.js";
import { getServerRef } from "../../../server-ref.js";

const inputSchema = {
  id: z.string().uuid().describe("The ID of the page containing the block"),
  propertyAlias: z.string().describe("The document property alias containing the blocks (e.g. 'mainContent'). Use inspect-blocks to find this."),
  contentKey: z.string().uuid().describe("The unique key of the block to edit. Use inspect-blocks to find this."),
  values: z.array(z.object({
    alias: z.string().describe("The property alias within the block"),
    value: z.any().describe("The new value"),
  })).describe("Properties to update within the block"),
  culture: z.string().nullable().optional().describe("Culture code if the document property is variant"),
  segment: z.string().nullable().optional().describe("Segment if the document property is variant"),
};

const outputSchema = z.object({
  message: z.string(),
  id: z.string(),
  name: z.string(),
  contentKey: z.string(),
  updatedFields: z.array(z.string()),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "edit-block",
  description: "Update properties within a specific block (BlockList, BlockGrid, or Rich Text block). Use inspect-blocks first to find the propertyAlias and contentKey. Changes are saved but NOT published. You will be asked to confirm before updating.",
  inputSchema,
  outputSchema,
  slices: ["update"],
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  handler: async ({ id, propertyAlias, contentKey, values, culture, segment }, extra) => {
    // Step 1: Fetch page details for confirmation
    const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (docResult.isError) return createToolResultError(docResult);
    const doc = extractChainedResult(docResult);
    const pageName = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

    // Step 2: Elicit confirmation
    const fieldNames = values.map(v => v.alias);
    const confirmMessage = `Update ${fieldNames.length} field(s) in block on "${pageName}" (property: ${propertyAlias}): ${fieldNames.join(", ")}? Changes will be saved but not published.`;

    const server = getServerRef();
    const elicitResult = await server.elicitInput(
      {
        message: confirmMessage,
        requestedSchema: {
          type: "object" as const,
          properties: {
            confirm: {
              type: "boolean" as const,
              title: "Confirm block edit",
              description: confirmMessage,
              default: true,
            },
          },
        },
      },
      { relatedRequestId: extra?.requestId },
    );

    if (elicitResult.action !== "accept" || !(elicitResult.content as any)?.confirm) {
      return createToolResult({ message: "Block edit cancelled", id, name: pageName, contentKey, updatedFields: [] });
    }

    // Step 3: Delegate to update-block-property
    const updateResult = await mcpClientManager.callTool("cms", "update-block-property", {
      documentId: id,
      propertyAlias,
      culture: culture ?? null,
      segment: segment ?? null,
      updates: [{
        contentKey,
        blockType: "content",
        properties: values.map(v => ({
          alias: v.alias,
          value: v.value,
        })),
      }],
    });
    if (updateResult.isError) return createToolResultError(updateResult);

    return createToolResult({
      message: `Updated ${fieldNames.length} field(s) in block on "${pageName}" (saved, not published)`,
      id,
      name: pageName,
      contentKey,
      updatedFields: fieldNames,
    });
  },
};

export default withStandardDecorators(tool);
```

- [ ] **Step 2: Register edit-block in content collection index**

Update `src/umbraco-api/tools/content/index.ts` — add import and include in tools array:

```typescript
import editBlockTool from "./put/edit-block.js";

// Updated tools array:
tools: () => [searchContentTool, getPageTool, listChildrenTool, listDocumentTypesTool, inspectBlocksTool, createPageTool, editPageTool, editBlockTool, deletePageTool],
```

- [ ] **Step 3: Compile, build, and run all integration tests**

Run: `npm run compile && npm run build && node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=__tests__ --runInBand --forceExit`

Expected: 25/25 integration tests passing. New tools won't have integration tests yet (added in Task 5).

- [ ] **Step 4: Commit**

```bash
git add src/umbraco-api/tools/content/put/edit-block.ts src/umbraco-api/tools/content/index.ts
git commit -m "feat: add edit-block tool for block property updates

Delegates to the dev MCP's update-block-property for targeted updates
to properties within BlockList, BlockGrid, and Rich Text blocks.
Includes elicitation confirmation before saving."
```

---

### Task 4: Improve get-page response shaping for blocks

**Files:**
- Modify: `src/umbraco-api/tools/content/get/get-page.ts`

Currently `get-page` dumps the entire raw `values` array including deeply nested block JSON. For block-based properties this can be huge and hard for the LLM to parse. Instead, summarise block properties (show property alias + block count + "use inspect-blocks for details") while keeping non-block values intact.

- [ ] **Step 1: Update get-page to summarise block content**

```typescript
import { z } from "zod";
import { withStandardDecorators, createToolResult, createToolResultError, ToolDefinition } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import { extractChainedResult } from "../../extract-chained-result.js";

const inputSchema = {
  id: z.string().uuid().describe("The unique ID of the page to retrieve"),
};

const outputSchema = z.object({
  id: z.string(),
  name: z.string(),
  documentType: z.string(),
  values: z.array(z.object({ alias: z.string(), value: z.any() }).passthrough()).describe("Content field values (block properties are summarised — use inspect-blocks for full block details)"),
  variants: z.array(z.object({ name: z.string() }).passthrough()).describe("Language/culture variants"),
  urls: z.array(z.any()).optional().describe("Published URLs"),
});

/**
 * Check if a value is block-based content and return a summary instead of the raw data.
 */
function summariseIfBlock(value: any): any {
  if (!value || typeof value !== "object") return value;

  // BlockList/BlockGrid
  if (Array.isArray(value.contentData) && Array.isArray(value.settingsData)) {
    return {
      _blockSummary: true,
      blockCount: value.contentData.length,
      hint: "Use inspect-blocks to see block details and edit-block to update block content",
    };
  }

  // RTE with blocks
  if (typeof value.markup === "string" && value.blocks && Array.isArray(value.blocks?.contentData)) {
    const blockCount = value.blocks.contentData.length;
    return {
      _blockSummary: true,
      markup: value.markup,
      blockCount,
      hint: blockCount > 0 ? "Use inspect-blocks to see embedded block details" : undefined,
    };
  }

  return value;
}

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "get-page",
  description: "Get the full details of a content page including all its fields and values. Block-based properties (BlockList, BlockGrid, Rich Text) are summarised — use inspect-blocks to see their full structure. Use this after search-content to see what a page contains.",
  inputSchema,
  outputSchema,
  slices: ["read"],
  annotations: { readOnlyHint: true },
  handler: async ({ id }) => {
    const result = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
    if (result.isError) return createToolResultError(result);
    const doc = extractChainedResult(result);
    return createToolResult({
      id: doc.id,
      name: doc.variants?.[0]?.name ?? doc.name ?? "Unknown",
      documentType: doc.documentType?.alias ?? "unknown",
      values: (doc.values ?? []).map((v: any) => ({
        ...v,
        value: summariseIfBlock(v.value),
      })),
      variants: doc.variants ?? [],
      urls: doc.urls ?? [],
    });
  },
};

export default withStandardDecorators(tool);
```

- [ ] **Step 2: Compile, build, and run get-page integration test**

Run: `npm run compile && npm run build && node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=content --runInBand --forceExit`

Expected: get-page test still passes — the response shape hasn't changed (values array with alias + value), just the value content for blocks is now a summary object.

- [ ] **Step 3: Commit**

```bash
git add src/umbraco-api/tools/content/get/get-page.ts
git commit -m "refactor: summarise block content in get-page response

Block-based property values (BlockList, BlockGrid, RTE with blocks)
are now returned as summaries with block count and hint to use
inspect-blocks. Reduces context size for pages with complex
block structures."
```

---

### Task 5: Add integration tests for new tools

**Files:**
- Modify: `src/umbraco-api/tools/content/__tests__/content.test.ts`

- [ ] **Step 1: Add inspect-blocks test**

After the existing `get-page` describe block, add:

```typescript
describe("inspect-blocks", () => {
  it("should return block structure for a page", async () => {
    if (!cmsAvailable || !testPageId) return;

    const result = await inspectBlocksTool.handler(
      { id: testPageId, propertyAlias: undefined },
      extra,
    );

    expect(result.isError).toBeFalsy();
    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.id).toBe(testPageId);
    expect(data.name).toEqual(expect.any(String));
    expect(data.blockProperties).toBeInstanceOf(Array);
    // blockProperties may be empty if the test page has no block content
  }, 30000);
});
```

Add the import at top (dynamic import after mocking):

```typescript
const { default: inspectBlocksTool } = await import("../get/inspect-blocks.js");
const { default: editBlockTool } = await import("../put/edit-block.js");
```

- [ ] **Step 2: Run integration tests**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=content --runInBand --forceExit`

Expected: All tests pass including new inspect-blocks test.

- [ ] **Step 3: Commit**

```bash
git add src/umbraco-api/tools/content/__tests__/content.test.ts
git commit -m "test: add integration tests for inspect-blocks"
```

---

### Task 6: Add eval tests for block workflows

**Files:**
- Modify: `tests/evals/content-workflows.test.ts`

- [ ] **Step 1: Add block inspection eval**

```typescript
it(
  "editor asks what blocks are on a page",
  runScenarioTest({
    prompt:
      "Show me the block content structure of the homepage — I want to see what blocks are on the page and what's in them.",
    tools: [
      "search-content",
      "get-page",
      "list-children",
      "inspect-blocks",
    ],
    requiredTools: ["inspect-blocks"],
    successPattern: /block|content|property|structure/i,
    verbose: true,
  }),
  timeout
);
```

- [ ] **Step 2: Add block editing eval (only if test site has block content)**

```typescript
it(
  "editor asks to edit content inside a block",
  runScenarioTest({
    prompt:
      "Find the homepage, look at its block content, and update the first block's title to 'Updated Block Title'.",
    tools: [
      "search-content",
      "get-page",
      "list-children",
      "inspect-blocks",
      "edit-block",
    ],
    requiredTools: ["inspect-blocks", "edit-block"],
    successPattern: /update|edit|block|saved|changed/i,
    verbose: true,
  }),
  timeout
);
```

Note: The block editing eval depends on the test Umbraco instance having pages with block content. If it doesn't, this eval will fail and should be skipped or conditionally included.

- [ ] **Step 3: Build and run evals**

Run: `npm run build && npm run test:evals`

Expected: All evals pass (new block evals may need adjustment based on test site content).

- [ ] **Step 4: Commit**

```bash
git add tests/evals/content-workflows.test.ts
git commit -m "test: add eval tests for block inspection and editing workflows"
```

---

### Task 7: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm run compile && npm run build && node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=__tests__ --runInBand --forceExit && npm run test:evals`

Expected: All integration tests and evals pass.

- [ ] **Step 2: Review tool descriptions with MCP tool reviewer**

Run the `umbraco-mcp-skills:mcp-tool-reviewer` agent against the new and modified tools to check descriptions, schema quality, and LLM-readiness.

- [ ] **Step 3: Final commit if any adjustments needed**
