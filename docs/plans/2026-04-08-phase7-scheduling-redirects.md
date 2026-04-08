# Phase 7: Scheduling & Redirects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **IMPORTANT:** Use `umbraco-mcp-skills` agents and skills for all tool, test, and eval creation.

**Goal:** Add scheduled publishing management and URL redirect management — 8 new tools across 2 collections. This is the final phase.

**Architecture:** Same delegation-to-CMS pattern. Scheduling tools use `get-document-publish` for status and `publish-document` with `publishSchedules` for scheduling/cancelling. `list-scheduled-content` scans one level at a time (consistent with all reporting tools). Redirect tools wrap the CMS redirect endpoints.

**Tech Stack:** TypeScript, Zod schemas, @umbraco-cms/mcp-server-sdk, @umbraco-cms/mcp-dev (chained CMS tools)

---

### Task 1: Add `scheduling` and `redirects` modes to registry

**Files:**
- Modify: `src/config/mode-registry.ts`

- [ ] **Step 1: Add modes**

Add to the `toolModes` array:

```typescript
{
  name: 'scheduling',
  displayName: 'Scheduling',
  description: 'View and manage scheduled content publishing',
  collections: ['scheduling']
},
{
  name: 'redirects',
  displayName: 'Redirects',
  description: 'View and manage URL redirects',
  collections: ['redirect']
},
```

- [ ] **Step 2: Compile and commit**

Run: `npm run compile`

```bash
git add src/config/mode-registry.ts
git commit -m "feat: add scheduling and redirects modes to registry"
```

---

### Task 2: Create `scheduling` collection — 4 tools

Use the `mcp-tool-creator` agent for each tool.

**Files:**
- Create: `src/umbraco-api/tools/scheduling/index.ts`
- Create: `src/umbraco-api/tools/scheduling/get/get-publish-status.ts`
- Create: `src/umbraco-api/tools/scheduling/get/list-scheduled-content.ts`
- Create: `src/umbraco-api/tools/scheduling/post/schedule-publish.ts`
- Create: `src/umbraco-api/tools/scheduling/post/cancel-schedule.ts`

- [ ] **Step 1: Create `get-publish-status` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `get-publish-status`
- Input: `id` (uuid)
- Output: `{ id, name, isPublished, state, variants: [{ name, culture, state, publishDate, scheduledPublishDate, scheduledUnpublishDate }] }`
- Delegate to: `mcpClientManager.callTool("cms", "get-document-publish", { id })`
- Handle 404 gracefully — return `{ isPublished: false, state: "NotPublished", variants: [] }` with a message instead of erroring
- Extract variant-level scheduling info from the response
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"View a page's current publish state including any scheduled publish or unpublish dates. Shows per-variant status for multilingual sites. Returns empty variants for unpublished pages."`

- [ ] **Step 2: Create `list-scheduled-content` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `list-scheduled-content`
- Input: optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, url, scheduledPublishDate, scheduledUnpublishDate, culture }], total, scannedPages }`
- Import `walkContentTree` from `../../helpers/tree-walker.js`
- For each page from `walkContentTree`, call `mcpClientManager.callTool("cms", "get-document-publish", { id: page.id })`
- Handle 404 from `get-document-publish` silently (unpublished pages have no publish status — skip them)
- Check each variant for non-null `scheduledPublishDate` or `scheduledUnpublishDate`
- Return only pages with pending schedules, one entry per scheduled variant
- Apply take/skip pagination on filtered results
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Find pages with pending scheduled publish or unpublish dates. Scans direct children of a parent (or root). Use parentId to check specific sections of the site."`

- [ ] **Step 3: Create `schedule-publish` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `schedule-publish`
- Input: `id` (uuid), `publishDate` (z.string().datetime(), ISO 8601), `culture` (string, optional)
- Output: `{ message, id, name, scheduledDate }`
- Fetch page name via `mcpClientManager.callTool("cms", "get-document-by-id", { id })`
- Import `confirmAction` from SDK
- Elicitation: `confirmAction(extra, \`Schedule "${pageName}" to publish on ${publishDate}?\`, { title: "Confirm schedule publish" })`
- Delegate to: `mcpClientManager.callTool("cms", "publish-document", { id, data: { publishSchedules: [{ culture: culture ?? null, schedule: publishDate }] } })`
- Slices: `["publish"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- Description: `"Schedule a page to publish at a future date. Provide the date in ISO 8601 format (must be in the future). Optionally specify a culture for variant-specific scheduling. You will be asked to confirm."`

- [ ] **Step 4: Create `cancel-schedule` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `cancel-schedule`
- Input: `id` (uuid), `culture` (string, optional)
- Output: `{ message, id, name }`
- Fetch page name and verify there's a schedule via `get-document-publish`. If no schedule exists, return a message saying so.
- Elicitation: `confirmAction(extra, \`Cancel the scheduled publish for "${pageName}"?\`, { title: "Confirm cancel schedule" })`
- Delegate to: `mcpClientManager.callTool("cms", "publish-document", { id, data: { publishSchedules: [] } })`
- Slices: `["publish"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- Description: `"Cancel a pending scheduled publish for a page. Use get-publish-status to verify the page has a pending schedule. You will be asked to confirm."`

- [ ] **Step 5: Create collection index**

Create `src/umbraco-api/tools/scheduling/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import getPublishStatusTool from "./get/get-publish-status.js";
import listScheduledContentTool from "./get/list-scheduled-content.js";
import schedulePublishTool from "./post/schedule-publish.js";
import cancelScheduleTool from "./post/cancel-schedule.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "scheduling",
    displayName: "Scheduling",
    description: "View and manage scheduled content publishing",
  },
  tools: () => [getPublishStatusTool, listScheduledContentTool, schedulePublishTool, cancelScheduleTool],
};

export default collection;
```

- [ ] **Step 6: Compile and commit**

Run: `npm run compile`

```bash
git add src/umbraco-api/tools/scheduling/
git commit -m "feat: add scheduling collection with get-publish-status, list-scheduled-content, schedule-publish, cancel-schedule"
```

---

### Task 3: Create `redirect` collection — 4 tools

Use the `mcp-tool-creator` agent for each tool.

**Files:**
- Create: `src/umbraco-api/tools/redirect/index.ts`
- Create: `src/umbraco-api/tools/redirect/get/list-redirects.ts`
- Create: `src/umbraco-api/tools/redirect/get/get-redirect.ts`
- Create: `src/umbraco-api/tools/redirect/get/get-redirect-status.ts`
- Create: `src/umbraco-api/tools/redirect/delete/delete-redirect.ts`

- [ ] **Step 1: Create `list-redirects` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `list-redirects`
- Input: `take` (default 50), `skip` (default 0), `filter` (string, optional — filter by URL)
- Output: `{ items: [{ id, originalUrl, destinationUrl, destinationType, isAutomatic }], total }`
- Delegate to: `mcpClientManager.callTool("cms", "get-all-redirects", { take, skip, filter })`
- Slices: `["list"]`, annotations: `{ readOnlyHint: true }`
- Description: `"List URL redirects configured on the site. Optionally filter by URL. Shows the original URL, destination, and whether the redirect was created automatically by Umbraco."`

- [ ] **Step 2: Create `get-redirect` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `get-redirect`
- Input: `id` (uuid)
- Output: `{ id, originalUrl, destinationUrl, destinationType, isAutomatic, createDate }`
- Delegate to: `mcpClientManager.callTool("cms", "get-redirect-by-id", { id })`
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"View the full details of a URL redirect including when it was created and whether it was automatic."`

- [ ] **Step 3: Create `get-redirect-status` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `get-redirect-status`
- Input: (none — empty inputSchema `{}`)
- Output: `{ isEnabled, message }`
- Delegate to: `mcpClientManager.callTool("cms", "get-redirect-status", {})`
- Map response: `isEnabled` from `status === "Enabled"`, message as human-readable summary
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Check whether automatic URL redirect tracking is enabled on the site. When enabled, Umbraco automatically creates redirects when pages are moved or renamed."`

- [ ] **Step 4: Create `delete-redirect` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `delete-redirect`
- Input: `id` (uuid)
- Output: `{ message, id, originalUrl }`
- Fetch redirect details via `get-redirect-by-id` for confirmation
- Import `confirmAction` from SDK
- Elicitation: `confirmAction(extra, \`Delete redirect from "${originalUrl}" to "${destinationUrl}"? Visitors following the old URL will get a 404.\`, { title: "Confirm delete redirect", defaultValue: false })`
- Delegate to: `mcpClientManager.callTool("cms", "delete-redirect", { id })`
- Slices: `["delete"]`, annotations: `{ readOnlyHint: false, destructiveHint: true, idempotentHint: false }`
- Description: `"Delete a URL redirect. Visitors following the original URL will get a 404 error. You will be asked to confirm."`

- [ ] **Step 5: Create collection index**

Create `src/umbraco-api/tools/redirect/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import listRedirectsTool from "./get/list-redirects.js";
import getRedirectTool from "./get/get-redirect.js";
import getRedirectStatusTool from "./get/get-redirect-status.js";
import deleteRedirectTool from "./delete/delete-redirect.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "redirect",
    displayName: "Redirects",
    description: "View and manage URL redirects",
  },
  tools: () => [listRedirectsTool, getRedirectTool, getRedirectStatusTool, deleteRedirectTool],
};

export default collection;
```

- [ ] **Step 6: Compile and commit**

Run: `npm run compile`

```bash
git add src/umbraco-api/tools/redirect/
git commit -m "feat: add redirect collection with list, get, get-status, delete tools"
```

---

### Task 4: Register collections and wire into entry points

**Files:**
- Modify: `src/collections.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Update collections.ts and index.ts**

Add `schedulingCollection` and `redirectCollection` imports and register in both files.

- [ ] **Step 2: Compile, build, test**

Run: `npm run compile && npm run build`
Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=__tests__ --runInBand --forceExit`
Expected: All existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/collections.ts src/index.ts
git commit -m "feat: register scheduling and redirect collections"
```

---

### Task 5: Review tools with mcp-tool-reviewer

- [ ] **Step 1: Run tool review on all 8 new tools**

Use the `mcp-tool-reviewer` agent:
- `src/umbraco-api/tools/scheduling/` (4 tools)
- `src/umbraco-api/tools/redirect/` (4 tools)

- [ ] **Step 2: Apply review feedback and commit**

```bash
git add -A
git commit -m "fix: apply tool review feedback to Phase 7 tools"
```

---

### Task 6: Integration tests for `scheduling` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/scheduling/__tests__/scheduling.test.ts`

- [ ] **Step 1: Create tests**

Tests should cover:
- `get-publish-status`: get status for a known page, verify variant shape (state, scheduledPublishDate, scheduledUnpublishDate). Handle 404 for unpublished pages gracefully.
- `list-scheduled-content`: scan root, verify structure (may return empty — no scheduled content on demo site)
- `schedule-publish` + `cancel-schedule`: schedule a page, then cancel. Elicitation accept for both. Guard with skip if page isn't published (scheduling requires a published page).
- Elicitation rejection for schedule-publish and cancel-schedule
- CMS check via `list-children` from content collection

- [ ] **Step 2: Run tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=scheduling/__tests__ --runInBand --forceExit
git add src/umbraco-api/tools/scheduling/__tests__/
git commit -m "test: add scheduling collection integration tests"
```

---

### Task 7: Integration tests for `redirect` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/redirect/__tests__/redirect.test.ts`

- [ ] **Step 1: Create tests**

Tests should cover:
- `list-redirects`: list all, verify structure (items array, total). May return empty.
- `get-redirect`: get by ID from list (if any exist), verify shape
- `get-redirect-status`: verify isEnabled is a boolean
- `delete-redirect`: elicitation rejection only (don't actually delete redirects on the demo site)
- Error: get-redirect with non-existent UUID
- CMS check via `get-redirect-status` (always works)

- [ ] **Step 2: Run tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=redirect/__tests__ --runInBand --forceExit
git add src/umbraco-api/tools/redirect/__tests__/
git commit -m "test: add redirect collection integration tests"
```

---

### Task 8: Eval tests for scheduling and redirect workflows

Use the `eval-test-creator` agent.

**Files:**
- Create: `tests/evals/scheduling-redirects-workflows.test.ts`
- Modify: all existing eval files to update `allTools` arrays

- [ ] **Step 1: Create eval tests**

5 scenarios:

1. "Check page publish status" — prompt: "Use get-publish-status to check the publish state of the homepage. First find the homepage with list-children.", tools: allTools, requiredTools: ["get-publish-status"], successPattern: /publish|state|status|schedule/i

2. "List scheduled content" — prompt: "Use list-scheduled-content to find pages with pending scheduled publish dates.", tools: ["list-scheduled-content", "list-children"], requiredTools: ["list-scheduled-content"], successPattern: /scheduled|publish|pending|none/i

3. "Schedule a page" — prompt: "Schedule the homepage to publish on 2099-01-01T09:00:00Z. First find the homepage.", tools: allTools, requiredTools: ["schedule-publish"], successPattern: /schedule|publish|confirm|2099/i

4. "List redirects" — prompt: "What URL redirects are configured on the site?", tools: ["list-redirects", "get-redirect-status"], requiredTools: ["list-redirects"], successPattern: /redirect|url|none/i

5. "Check redirect tracking" — prompt: "Is URL redirect tracking enabled on this site?", tools: ["get-redirect-status"], requiredTools: ["get-redirect-status"], successPattern: /redirect|tracking|enabled|disabled/i

- [ ] **Step 2: Update allTools in all existing eval files**

Add 8 new tool names:
```typescript
// Scheduling
"get-publish-status", "list-scheduled-content", "schedule-publish", "cancel-schedule",
// Redirects
"list-redirects", "get-redirect", "delete-redirect", "get-redirect-status",
```

- [ ] **Step 3: Run evals and commit**

```bash
npm run test:evals
git add tests/evals/
git commit -m "test: add scheduling and redirect eval tests, update allTools arrays"
```

---

### Task 9: Update hosted e2e test tool list

**Files:**
- Modify: `tests/hosted-e2e/mcp-inspector.test.ts`
- Modify: `tests/hosted-e2e/elicitation.test.ts`

- [ ] **Step 1: Update ALL_TOOLS arrays**

Add 8 new tool names (81 tools total). Read tools: get-publish-status, list-scheduled-content, list-redirects, get-redirect, get-redirect-status. Write tools: schedule-publish, cancel-schedule, delete-redirect.

- [ ] **Step 2: Run hosted e2e tests**

Run: `HEADLESS=true SLOW_MO=0 npx playwright test --config tests/hosted-e2e/playwright.config.ts`

- [ ] **Step 3: Commit**

```bash
git add tests/hosted-e2e/
git commit -m "test: update hosted e2e tests for 81-tool count"
```

---

### Task 10: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run compile
npm run build
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=__tests__ --runInBand --forceExit
npm run test:evals
HEADLESS=true SLOW_MO=0 npx playwright test --config tests/hosted-e2e/playwright.config.ts
```

Expected:
- Integration tests: ~145+ passing
- Evals: ~68+ passing
- Hosted e2e: 4 passing

- [ ] **Step 2: Verify tool count**

Confirm 81 tools registered.

- [ ] **Step 3: Final commit and push**

```bash
git add -A
git commit -m "chore: Phase 7 complete — 81 tools across 20 collections. All phases done."
git push
```
