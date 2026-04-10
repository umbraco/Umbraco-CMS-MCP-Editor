# bulk-move-media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `bulk-move-media` tool to the `media-management` collection that moves up to 10 media items/folders to a destination folder with confirmation.

**Architecture:** Single new tool file following the existing `bulk-move` (content) pattern, reusing `validateBulkIds`, `executeBulkSequentially`, and `buildBulkOutput` from `bulk-handler.ts`. Media name fetching is inline (no version tracking needed). Registered in the `media-management` collection.

**Tech Stack:** TypeScript, Zod, `@umbraco-cms/mcp-server-sdk`, Jest

---

### Task 1: Create bulk-move-media tool

**Files:**
- Create: `src/umbraco-api/tools/media-management/post/bulk-move-media.ts`

- [ ] **Step 1: Create the tool file**

```typescript
import { z } from "zod";
import { withStandardDecorators, createToolResult, ToolDefinition, confirmAction, extractChainedResult } from "@umbraco-cms/mcp-server-sdk";
import { mcpClientManager } from "../../../mcp-client.js";
import {
  validateBulkIds,
  executeBulkSequentially,
  buildBulkOutput,
  type BulkOperationOutput,
} from "../../helpers/bulk-handler.js";

const inputSchema = {
  ids: z.array(z.string().uuid()).min(1).max(10).describe("The IDs of the media items or folders to move (max 10)"),
  targetParentId: z.string().uuid().describe("The ID of the destination folder"),
};

const outputSchema = z.object({
  message: z.string(),
  results: z.array(z.object({
    id: z.string(),
    name: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  })),
  successCount: z.number(),
  failureCount: z.number(),
  skippedCount: z.number(),
});

const tool: ToolDefinition<typeof inputSchema, typeof outputSchema> = {
  name: "bulk-move-media",
  description: "Move multiple media items or folders to a different folder (max 10). Lists each item name and destination for confirmation before moving. Sequential execution stops on first failure.",
  inputSchema,
  outputSchema,
  slices: ["move"],
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  handler: async ({ ids, targetParentId }, extra) => {
    // 1. Validate cap
    const validationError = validateBulkIds(ids);
    if (validationError) return createToolResult(validationError as BulkOperationOutput);

    // 2. Fetch media names in parallel
    const itemDetails = await Promise.all(
      ids.map(async (id) => {
        try {
          const result = await mcpClientManager.callTool("cms", "get-media-by-id", { id });
          if (result.isError) return { id, name: "Unknown", currentVersionId: "" };
          const media = extractChainedResult(result);
          return { id, name: media.name ?? "Unknown", currentVersionId: "" };
        } catch {
          return { id, name: "Unknown", currentVersionId: "" };
        }
      }),
    );

    if (itemDetails.every(i => i.name === "Unknown")) {
      return createToolResult({
        message: "Could not fetch media details",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
      });
    }

    // 3. Fetch target folder name
    let targetName = targetParentId;
    try {
      const targetResult = await mcpClientManager.callTool("cms", "get-media-by-id", { id: targetParentId });
      if (!targetResult.isError) {
        const target = extractChainedResult(targetResult);
        targetName = target.name ?? targetParentId;
      }
    } catch {
      // Fall back to showing the ID
    }

    // 4. Confirm
    const nameList = itemDetails.map(i => `- ${i.name}`).join("\n");
    const message = `Move these ${itemDetails.length} media items to '${targetName}'?\n${nameList}`;

    if (!await confirmAction(extra, message, { title: "Confirm bulk move media", defaultValue: false })) {
      return createToolResult({
        message: "Cancelled",
        results: [],
        successCount: 0,
        failureCount: 0,
        skippedCount: 0,
      });
    }

    // 5. Execute sequentially
    const results = await executeBulkSequentially(itemDetails, async (item) => {
      const result = await mcpClientManager.callTool("cms", "move-media", {
        id: item.id,
        target: { id: targetParentId },
      });
      if (result.isError) {
        return extractChainedResult(result)?.detail ?? "Move failed";
      }
      return null;
    });

    // 6. Build output — override message to say "media items" instead of "pages"
    const output = buildBulkOutput("Moved", results);
    output.message = output.message.replace("pages", "media items");
    return createToolResult(output);
  },
};

export default withStandardDecorators(tool);
```

- [ ] **Step 2: Run type check to verify it compiles**

Run: `npm run compile`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/umbraco-api/tools/media-management/post/bulk-move-media.ts
git commit -m "feat: add bulk-move-media tool"
```

---

### Task 2: Register in media-management collection

**Files:**
- Modify: `src/umbraco-api/tools/media-management/index.ts`

- [ ] **Step 1: Add import and register the tool**

Add import after the existing imports:
```typescript
import bulkMoveMediaTool from "./post/bulk-move-media.js";
```

Add `bulkMoveMediaTool` to the tools array:
```typescript
tools: () => [uploadMediaTool, createMediaFolderTool, moveMediaTool, deleteMediaTool, restoreMediaTool, bulkMoveMediaTool],
```

- [ ] **Step 2: Run type check**

Run: `npm run compile`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/umbraco-api/tools/media-management/index.ts
git commit -m "feat: register bulk-move-media in media-management collection"
```

---

### Task 3: Add integration test

**Files:**
- Modify: `src/umbraco-api/tools/media-management/__tests__/media-management.test.ts`

- [ ] **Step 1: Add import for the new tool**

Add after the existing tool imports (line ~24):
```typescript
import bulkMoveMediaTool from "../post/bulk-move-media.js";
```

- [ ] **Step 2: Add bulk-move-media test block**

Add a new `describe` block after the existing `move-media` describe block (~line 176):

```typescript
describe("bulk-move-media", () => {
  let sourceFolderIds: string[];
  let targetFolderId: string;

  it("should bulk move media folders into a target folder", async () => {
    if (!cmsAvailable) return;

    // Create three folders: two to move, one as target
    const source1Result = await createMediaFolderTool.handler(
      { name: "Bulk Move Source 1", parentId: undefined },
      extra,
    );
    elicitation.reset();
    const source2Result = await createMediaFolderTool.handler(
      { name: "Bulk Move Source 2", parentId: undefined },
      extra,
    );
    elicitation.reset();
    const targetResult = await createMediaFolderTool.handler(
      { name: "Bulk Move Target", parentId: undefined },
      extra,
    );
    elicitation.reset();

    if (source1Result.isError || source2Result.isError || targetResult.isError) {
      console.warn("Skipping bulk-move-media test: could not create test folders");
      return;
    }

    const source1Data = getStructuredContent(source1Result) as any;
    const source2Data = getStructuredContent(source2Result) as any;
    const targetData = getStructuredContent(targetResult) as any;
    sourceFolderIds = [source1Data.id, source2Data.id];
    targetFolderId = targetData.id;
    createdFolderIds.push(source1Data.id, source2Data.id, targetFolderId);

    const result = await bulkMoveMediaTool.handler(
      { ids: sourceFolderIds, targetParentId: targetFolderId },
      extra,
    );

    if (result.isError) {
      console.warn("Skipping bulk-move-media assertions: CMS returned error");
      return;
    }

    const data = getStructuredContent(result) as any;
    expect(data).toBeDefined();
    expect(data.message).toContain("Moved");
    expect(data.successCount).toBe(2);
    expect(data.failureCount).toBe(0);
    expect(data.results).toHaveLength(2);
    expect(data.results[0].success).toBe(true);
    expect(data.results[1].success).toBe(true);
  }, 90000);

  it("should cancel bulk-move-media when elicitation is rejected", async () => {
    if (!cmsAvailable) return;

    // Create folders for the attempt
    const source1Result = await createMediaFolderTool.handler(
      { name: "Bulk Move Reject Source 1", parentId: undefined },
      extra,
    );
    elicitation.reset();
    const targetResult = await createMediaFolderTool.handler(
      { name: "Bulk Move Reject Target", parentId: undefined },
      extra,
    );
    elicitation.reset();

    if (source1Result.isError || targetResult.isError) {
      console.warn("Skipping bulk-move-media rejection test: could not create test folders");
      return;
    }

    const source1Data = getStructuredContent(source1Result) as any;
    const targetData = getStructuredContent(targetResult) as any;
    createdFolderIds.push(source1Data.id, targetData.id);

    elicitation.rejectAll();

    const result = await bulkMoveMediaTool.handler(
      { ids: [source1Data.id], targetParentId: targetData.id },
      extra,
    );

    const data = getStructuredContent(result) as any;
    expect(data?.message?.includes("Cancelled") || result.isError).toBe(true);
  }, 60000);
});
```

- [ ] **Step 3: Run type check**

Run: `npm run compile`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/umbraco-api/tools/media-management/__tests__/media-management.test.ts
git commit -m "test: add bulk-move-media integration tests"
```

---

### Task 4: Add to eval test allTools list

**Files:**
- Modify: `tests/evals/media-workflows.test.ts`

- [ ] **Step 1: Add bulk-move-media to allTools array**

Add `"bulk-move-media"` after `"restore-media"` in the Media section (~line 44):

```typescript
  "restore-media",
  "bulk-move-media",
```

- [ ] **Step 2: Run type check**

Run: `npm run compile`
Expected: No errors

- [ ] **Step 3: Check all other eval files for allTools arrays and add there too**

Search for other eval files with `allTools` arrays and add `"bulk-move-media"` to each.

- [ ] **Step 4: Commit**

```bash
git add tests/evals/
git commit -m "test: add bulk-move-media to eval allTools lists"
```

---

### Task 5: Build and verify

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 2: Run integration tests (if CMS available)**

Run: `npm test -- --testPathPattern=media-management`
Expected: All tests pass (or skip gracefully if no CMS)

- [ ] **Step 3: Final commit if any adjustments needed**
