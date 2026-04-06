# Phase 5: Bulk Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **IMPORTANT:** Use `umbraco-mcp-skills` agents and skills for all tool, test, and eval creation.

**Goal:** Add 5 safe bulk content operations (publish, unpublish, schedule, set property, move) with 10-item hard cap, per-item confirmation, sequential execution, and version-based rollback support.

**Architecture:** All tools follow a shared pattern: validate cap → fetch page details (names + version IDs) → elicit confirmation listing every page → execute sequentially → return per-item results with `previousVersionId` for rollback via the existing `rollback-page` tool. A shared `bulk-handler` helper encapsulates the common logic.

**Tech Stack:** TypeScript, Zod schemas, @umbraco-cms/mcp-server-sdk, @umbraco-cms/mcp-dev (chained CMS tools)

---

### Task 1: Add `bulk-operations` mode to registry

**Files:**
- Modify: `src/config/mode-registry.ts`

- [ ] **Step 1: Add mode**

Add to the `toolModes` array in `src/config/mode-registry.ts`:

```typescript
{
  name: 'bulk-operations',
  displayName: 'Bulk Operations',
  description: 'Bulk publish, unpublish, schedule, edit, and move content pages (max 10 per call)',
  collections: ['bulk-operations']
},
```

- [ ] **Step 2: Compile and commit**

Run: `npm run compile`

```bash
git add src/config/mode-registry.ts
git commit -m "feat: add bulk-operations mode to registry"
```

---

### Task 2: Create shared bulk handler helper

All 5 bulk tools share the same flow: validate → fetch details → confirm → execute → report. Extract this into a shared helper.

**Files:**
- Create: `src/umbraco-api/tools/helpers/bulk-handler.ts`

- [ ] **Step 1: Create the bulk handler helper**

Create `src/umbraco-api/tools/helpers/bulk-handler.ts`:

```typescript
/**
 * Bulk Operation Handler
 *
 * Shared helper for bulk tools. Encapsulates the validate → fetch → confirm → execute flow
 * with 10-item hard cap, per-item confirmation, sequential execution, and rollback support.
 */

import { createToolResult, createToolResultError, confirmAction, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../mcp-client.js";

const MAX_BULK_ITEMS = 10;

export interface BulkItemDetail {
  id: string;
  name: string;
  currentVersionId: string;
  /** Extra data the caller may need (e.g. current parent name for move) */
  extra?: Record<string, any>;
}

export interface BulkResult {
  id: string;
  name: string;
  success: boolean;
  previousVersionId?: string;
  error?: string;
}

export interface BulkOperationOutput {
  message: string;
  results: BulkResult[];
  successCount: number;
  failureCount: number;
  skippedCount: number;
}

/**
 * Fetch page details for all IDs — names and current version IDs.
 * Used by the confirmation message and for rollback support.
 */
export async function fetchBulkItemDetails(ids: string[]): Promise<BulkItemDetail[]> {
  const details = await Promise.all(
    ids.map(async (id): Promise<BulkItemDetail | null> => {
      try {
        // Get document details
        const docResult = await mcpClientManager.callTool("cms", "get-document-by-id", { id });
        if (docResult.isError) return null;
        const doc = extractChainedResult(docResult);
        const name = doc.variants?.[0]?.name ?? doc.name ?? "Unknown";

        // Get current version ID
        const versionResult = await mcpClientManager.callTool("cms", "get-document-version", {
          documentId: id, take: 1, skip: 0,
        });
        const versionData = versionResult.isError ? null : extractChainedResult(versionResult);
        const currentVersionId = versionData?.items?.[0]?.id ?? "";

        return { id, name, currentVersionId };
      } catch {
        return null;
      }
    }),
  );

  return details.filter((d): d is BulkItemDetail => d !== null);
}

/**
 * Validate bulk IDs and return error result if invalid.
 */
export function validateBulkIds(ids: string[]): BulkOperationOutput | null {
  if (ids.length === 0) {
    return {
      message: "No page IDs provided",
      results: [],
      successCount: 0,
      failureCount: 0,
      skippedCount: 0,
    };
  }
  if (ids.length > MAX_BULK_ITEMS) {
    return {
      message: `Too many items: ${ids.length} exceeds maximum of ${MAX_BULK_ITEMS}. Provide at most ${MAX_BULK_ITEMS} IDs per call.`,
      results: [],
      successCount: 0,
      failureCount: 0,
      skippedCount: 0,
    };
  }
  return null;
}

/**
 * Execute a bulk operation sequentially with per-item results.
 * Stops on first failure — remaining items are marked as skipped.
 *
 * @param items - Page details (from fetchBulkItemDetails)
 * @param executeFn - Function to execute for each item. Return null on success, error string on failure.
 */
export async function executeBulkSequentially(
  items: BulkItemDetail[],
  executeFn: (item: BulkItemDetail) => Promise<string | null>,
): Promise<BulkResult[]> {
  const results: BulkResult[] = [];
  let stopped = false;

  for (const item of items) {
    if (stopped) {
      results.push({
        id: item.id,
        name: item.name,
        success: false,
        previousVersionId: item.currentVersionId || undefined,
        error: "Skipped — previous item failed",
      });
      continue;
    }

    const error = await executeFn(item);
    if (error) {
      results.push({
        id: item.id,
        name: item.name,
        success: false,
        previousVersionId: item.currentVersionId || undefined,
        error,
      });
      stopped = true;
    } else {
      results.push({
        id: item.id,
        name: item.name,
        success: true,
        previousVersionId: item.currentVersionId || undefined,
      });
    }
  }

  return results;
}

/**
 * Build the summary output from per-item results.
 */
export function buildBulkOutput(
  actionVerb: string,
  results: BulkResult[],
): BulkOperationOutput {
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success && r.error !== "Skipped — previous item failed").length;
  const skippedCount = results.filter(r => r.error === "Skipped — previous item failed").length;

  return {
    message: `${actionVerb} ${successCount} of ${results.length} pages`,
    results,
    successCount,
    failureCount,
    skippedCount,
  };
}
```

- [ ] **Step 2: Compile and commit**

Run: `npm run compile`

```bash
git add src/umbraco-api/tools/helpers/bulk-handler.ts
git commit -m "feat: add shared bulk handler helper with cap validation, sequential execution, rollback support"
```

---

### Task 3: Create `bulk-operations` collection — 5 tools

Use the `mcp-tool-creator` agent to create each tool.

**Files:**
- Create: `src/umbraco-api/tools/bulk-operations/index.ts`
- Create: `src/umbraco-api/tools/bulk-operations/post/bulk-publish.ts`
- Create: `src/umbraco-api/tools/bulk-operations/post/bulk-unpublish.ts`
- Create: `src/umbraco-api/tools/bulk-operations/post/bulk-schedule-publish.ts`
- Create: `src/umbraco-api/tools/bulk-operations/post/bulk-set-property.ts`
- Create: `src/umbraco-api/tools/bulk-operations/post/bulk-move.ts`

- [ ] **Step 1: Create `bulk-publish` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `bulk-publish`
- Input: `ids` (array of uuid, min 1, max 10), `includeDescendants` (boolean, optional, default false)
- Output: shared `BulkOperationOutput` shape (message, results with previousVersionId, successCount, failureCount, skippedCount)
- Import `{ validateBulkIds, fetchBulkItemDetails, executeBulkSequentially, buildBulkOutput }` from `../../helpers/bulk-handler.js`
- Import `confirmAction` from SDK
- Handler:
  1. `const validationError = validateBulkIds(ids); if (validationError) return createToolResult(validationError);`
  2. `const items = await fetchBulkItemDetails(ids);`
  3. Build confirmation: `"Publish these N pages?\n" + items.map(i => "- " + i.name).join("\n")`
  4. `if (!await confirmAction(extra, message, { title: "Confirm bulk publish" })) return createToolResult({ message: "Bulk publish cancelled", ... })`
  5. Execute: for each item call `mcpClientManager.callTool("cms", includeDescendants ? "publish-document-with-descendants" : "publish-document", { id: item.id, data: { publishSchedules: [] } })`
  6. Return `buildBulkOutput("Published", results)`
- Slices: `["publish"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- Description: `"Publish multiple pages at once (max 10). Lists all page names for confirmation. Each result includes a previousVersionId for rollback. Use search-content or list-children to find page IDs first."`

- [ ] **Step 2: Create `bulk-unpublish` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `bulk-unpublish`
- Input: `ids` (array of uuid, min 1, max 10)
- Output: shared `BulkOperationOutput` shape
- Same helper imports as bulk-publish
- Handler: same flow but for each item, fetch document to get cultures, then call `mcpClientManager.callTool("cms", "unpublish-document", { id, data: { cultures: cultures.length > 0 ? cultures : null } })`
- Confirmation: `"Unpublish these N pages? They will be taken offline.\n" + names`
- `confirmAction(extra, message, { title: "Confirm bulk unpublish", defaultValue: false })`
- Slices: `["publish"]`, annotations: `{ readOnlyHint: false, destructiveHint: true, idempotentHint: false }`
- Description: `"Take multiple pages offline at once (max 10). Pages will remain as drafts. Lists all page names for confirmation. Each result includes a previousVersionId for rollback."`

- [ ] **Step 3: Create `bulk-schedule-publish` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `bulk-schedule-publish`
- Input: `ids` (array of uuid, min 1, max 10), `publishDate` (string, ISO 8601 datetime)
- Output: shared `BulkOperationOutput` shape
- Handler: same flow but for each item call `mcpClientManager.callTool("cms", "publish-document", { id, data: { publishSchedules: [{ culture: null, schedule: publishDate }] } })`
- Confirmation: `"Schedule these N pages to publish on {publishDate}?\n" + names`
- Slices: `["publish"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- Description: `"Schedule multiple pages to publish at a future date (max 10). Provide the date in ISO 8601 format. Lists all page names and the scheduled date for confirmation."`

- [ ] **Step 4: Create `bulk-set-property` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `bulk-set-property`
- Input: `ids` (array of uuid, min 1, max 10), `alias` (string), `value` (any), `culture` (string, optional), `segment` (string, optional)
- Output: shared `BulkOperationOutput` shape
- Handler: same flow but for each item call `mcpClientManager.callTool("cms", "update-document-properties", { id: item.id, values: [{ alias, value, culture: culture ?? null, segment: segment ?? null }] })`
- Confirmation: `"Set '${alias}' to '${JSON.stringify(value)}' on these N pages?\n" + names`
- Slices: `["update"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- Description: `"Set the same property value on multiple pages at once (max 10). Call get-page first to verify the property alias exists. Lists all page names and the property change for confirmation. Each result includes a previousVersionId for rollback."`

- [ ] **Step 5: Create `bulk-move` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `bulk-move`
- Input: `ids` (array of uuid, min 1, max 10), `targetParentId` (uuid)
- Output: shared `BulkOperationOutput` shape
- Handler:
  1. Validate IDs
  2. Fetch item details AND target parent name in parallel
  3. For the confirmation, show current parent of each page. To get current parent, look at the document's parent from the CMS response or use `get-document-by-id` which includes parent info.
  4. Confirmation: `"Move these N pages to '${targetName}'?\n" + items.map(i => "- " + i.name + " (currently " + i.extra?.currentParent + ")").join("\n")`
  5. `confirmAction(extra, message, { title: "Confirm bulk move", defaultValue: false })`
  6. Execute: for each item call `mcpClientManager.callTool("cms", "move-document", { id: item.id, target: { id: targetParentId } })`
- Slices: `["move"]`, annotations: `{ readOnlyHint: false, destructiveHint: true, idempotentHint: false }`
- Description: `"Move multiple pages to a new parent location (max 10). Shows each page's current and target location for confirmation. Restructuring the site tree is hard to undo — review the list carefully. Each result includes a previousVersionId for rollback."`

- [ ] **Step 6: Create collection index**

Create `src/umbraco-api/tools/bulk-operations/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import bulkPublishTool from "./post/bulk-publish.js";
import bulkUnpublishTool from "./post/bulk-unpublish.js";
import bulkSchedulePublishTool from "./post/bulk-schedule-publish.js";
import bulkSetPropertyTool from "./post/bulk-set-property.js";
import bulkMoveTool from "./post/bulk-move.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "bulk-operations",
    displayName: "Bulk Operations",
    description: "Safe bulk content operations with confirmation and rollback support",
  },
  tools: () => [bulkPublishTool, bulkUnpublishTool, bulkSchedulePublishTool, bulkSetPropertyTool, bulkMoveTool],
};

export default collection;
```

- [ ] **Step 7: Compile and commit**

Run: `npm run compile`

```bash
git add src/umbraco-api/tools/bulk-operations/
git commit -m "feat: add bulk-operations collection with publish, unpublish, schedule, set-property, move tools"
```

---

### Task 4: Register collection and wire into entry points

**Files:**
- Modify: `src/collections.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Update collections.ts and index.ts**

Add `bulkOperationsCollection` import and register in both files.

- [ ] **Step 2: Compile, build, test**

Run: `npm run compile && npm run build`
Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=__tests__ --runInBand --forceExit`
Expected: All 102 existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/collections.ts src/index.ts
git commit -m "feat: register bulk-operations collection"
```

---

### Task 5: Review tools with mcp-tool-reviewer

- [ ] **Step 1: Run tool review**

Use the `mcp-tool-reviewer` agent to review all 5 new tools plus the shared helper.

- [ ] **Step 2: Apply review feedback and commit**

```bash
git add -A
git commit -m "fix: apply tool review feedback to Phase 5 bulk tools"
```

---

### Task 6: Integration tests for `bulk-operations` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/bulk-operations/__tests__/bulk-operations.test.ts`

- [ ] **Step 1: Create integration tests**

Tests should cover:
- **Cap validation**: pass 11 IDs, expect error message about exceeding 10
- **bulk-publish**: publish 1-2 test pages, verify per-item results with previousVersionId
- **bulk-unpublish**: unpublish test pages, verify destructive default unchecked in elicitation
- **bulk-schedule-publish**: schedule with future date
- **bulk-set-property**: set a property on 1-2 pages
- **bulk-move**: move 1-2 pages to a different parent (create test pages for this)
- **Elicitation rejection** for all 5 tools
- **Cleanup**: rollback/delete any test pages in afterAll

- [ ] **Step 2: Run tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=bulk-operations/__tests__ --runInBand --forceExit
git add src/umbraco-api/tools/bulk-operations/__tests__/
git commit -m "test: add bulk-operations integration tests"
```

---

### Task 7: Eval tests for bulk workflows

Use the `eval-test-creator` agent.

**Files:**
- Create: `tests/evals/bulk-workflows.test.ts`
- Modify: all existing eval files to update `allTools` arrays

- [ ] **Step 1: Create eval tests**

5 scenarios:

1. "Publish the homepage and about page together" — requires `bulk-publish`, pattern: /publish|bulk|page/i
2. "Take these blog posts offline" — requires `bulk-unpublish`, pattern: /unpublish|offline|bulk/i
3. "Schedule the homepage to publish next Monday" — requires `bulk-schedule-publish`, pattern: /schedule|publish|date/i
4. "Set the heroHeader to 'Welcome' on the root pages — first use list-children to find them" — requires `bulk-set-property`, pattern: /set|property|bulk|welcome/i
5. "Move these pages under the Blog section" — requires `bulk-move`, pattern: /move|bulk|page/i

- [ ] **Step 2: Update allTools in all eval files**

Add 5 new tool names: `bulk-publish`, `bulk-unpublish`, `bulk-schedule-publish`, `bulk-set-property`, `bulk-move`

- [ ] **Step 3: Run evals and commit**

```bash
npm run test:evals
git add tests/evals/
git commit -m "test: add bulk operation eval tests, update allTools arrays"
```

---

### Task 8: Update hosted e2e test tool list

**Files:**
- Modify: `tests/hosted-e2e/mcp-inspector.test.ts`
- Modify: `tests/hosted-e2e/elicitation.test.ts`

- [ ] **Step 1: Update ALL_TOOLS arrays**

Add 5 new tool names to WRITE_TOOLS and ALL_TOOLS (61 tools total).

- [ ] **Step 2: Run hosted e2e tests**

Run: `HEADLESS=true SLOW_MO=0 npx playwright test --config tests/hosted-e2e/playwright.config.ts`

- [ ] **Step 3: Commit**

```bash
git add tests/hosted-e2e/
git commit -m "test: update hosted e2e tests for 61-tool count"
```

---

### Task 9: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run compile
npm run build
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=__tests__ --runInBand --forceExit
npm run test:evals
HEADLESS=true SLOW_MO=0 npx playwright test --config tests/hosted-e2e/playwright.config.ts
```

Expected:
- Integration tests: ~115+ passing
- Evals: ~57 passing
- Hosted e2e: 4 passing

- [ ] **Step 2: Verify tool count**

Confirm 61 tools registered.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: Phase 5 complete — 61 tools across 15 collections"
```
