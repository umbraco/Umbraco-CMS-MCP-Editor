# Phase 2: Media & Blueprints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **IMPORTANT:** Use `umbraco-mcp-skills` agents and skills for all tool, test, and eval creation. See the feedback memory `feedback_use_mcp_skills.md`.

**Goal:** Add media library management (browse, search, upload, organise, delete, restore) and blueprint support (list, view, create from page) to the editor MCP.

**Architecture:** 12 new tools across 3 collections (`media`, `media-management`, `blueprint`), all delegating to the CMS dev MCP via `mcpClientManager.callTool("cms", ...)`. Write tools use `confirmAction()` for elicitation. Same patterns as Phase 1 content/publishing/versioning tools.

**Tech Stack:** TypeScript, Zod schemas, @umbraco-cms/mcp-server-sdk, @umbraco-cms/mcp-dev (chained CMS tools)

---

### Task 1: Add `move` slice to registry and new modes

**Files:**
- Modify: `src/config/slice-registry.ts`
- Modify: `src/config/mode-registry.ts`

- [ ] **Step 1: Add `move` slice**

In `src/config/slice-registry.ts`, add `'move'` to the `toolSliceNames` array after the existing entries:

```typescript
export const toolSliceNames = [
  ...baseSliceNames,
  'search',
  'tree',
  'publish',
  'version',
  'move',
] as const;
```

- [ ] **Step 2: Add `media` and `blueprints` modes**

In `src/config/mode-registry.ts`, add two new mode definitions to the `toolModes` array:

```typescript
export const toolModes: ToolModeDefinition[] = [
  {
    name: 'content',
    displayName: 'Content Management',
    description: 'Create, edit, search, and manage content pages',
    collections: ['content', 'publishing', 'versioning']
  },
  {
    name: 'media',
    displayName: 'Media Management',
    description: 'Browse, search, upload, and manage media files and folders',
    collections: ['media', 'media-management']
  },
  {
    name: 'blueprints',
    displayName: 'Blueprints',
    description: 'List, view, and create page blueprints (templates)',
    collections: ['blueprint']
  },
];
```

- [ ] **Step 3: Compile and verify**

Run: `npm run compile`
Expected: Clean compile, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/config/slice-registry.ts src/config/mode-registry.ts
git commit -m "feat: add move slice and media/blueprints modes to registries"
```

---

### Task 2: Create `media` collection — read tools

Use the `mcp-tool-creator` agent to create each tool, then wire them into the collection index.

**Files:**
- Create: `src/umbraco-api/tools/media/index.ts`
- Create: `src/umbraco-api/tools/media/get/search-media.ts`
- Create: `src/umbraco-api/tools/media/get/list-media-children.ts`
- Create: `src/umbraco-api/tools/media/get/get-media.ts`
- Create: `src/umbraco-api/tools/media/get/list-media-types.ts`

- [ ] **Step 1: Create `search-media` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `search-media`
- Input: `query` (string, filter), optional `parentId` (uuid, scope to folder), `take` (default 10), `skip` (default 0)
- Output: `{ items: [{ id, name, mediaType, url }], total }`
- Delegate to: `mcpClientManager.callTool("cms", "get-collection-media", { id: parentId, filter: query, take, skip })`
- Then call `mcpClientManager.callTool("cms", "get-media-urls", { id: [...itemIds] })` to enrich with URLs
- Slices: `["search"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Search for media items by name. Returns matching items with names, types, and URLs. Use get-media for full details. Use list-media-children to browse folders."`

- [ ] **Step 2: Create `list-media-children` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `list-media-children`
- Input: optional `parentId` (uuid), `take` (default 20), `skip` (default 0)
- Output: `{ items: [{ id, name, mediaType, hasChildren, isFolder }], total }`
- When `parentId` is omitted: delegate to `mcpClientManager.callTool("cms", "get-media-root", { take, skip })`
- When `parentId` is provided: delegate to `mcpClientManager.callTool("cms", "get-media-children", { parentId, take, skip })`
- `isFolder`: derive from `mediaType` containing "Folder"
- `hasChildren`: from the CMS response `hasChildren` field
- Slices: `["tree"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Browse the media library. Shows items and folders under a parent, or root-level items if no parent specified. Use this to navigate the media tree."`

- [ ] **Step 3: Create `get-media` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `get-media`
- Input: `id` (uuid)
- Output: `{ id, name, mediaType, urls, values, variants }` (shape TBD by what CMS returns — inspect `get-media-by-id` response)
- Delegate to: `mcpClientManager.callTool("cms", "get-media-by-id", { id })` + `mcpClientManager.callTool("cms", "get-media-urls", { id: [id] })`
- Merge URLs into the response. Extract width/height/fileSize from values if present.
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Get the full details of a media item including URLs, dimensions, and properties. Use search-media or list-media-children to find items first."`

- [ ] **Step 4: Create `list-media-types` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `list-media-types`
- Input: optional `parentId` (uuid — to show what's allowed in that folder)
- Output: `{ items: [{ id, alias, name, icon }], total }`
- When `parentId` omitted: delegate to `mcpClientManager.callTool("cms", "get-media-type-allowed-at-root", {})`
- When `parentId` provided: delegate to `mcpClientManager.callTool("cms", "get-media-type-allowed-children", { id: parentId })`
- Slices: `["list"]`, annotations: `{ readOnlyHint: true }`
- Description: `"List media types allowed in a folder (or at root). Use this before upload-media to find the correct media type. Returns the ID, alias, and name of each type."`

- [ ] **Step 5: Create collection index**

Create `src/umbraco-api/tools/media/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import searchMediaTool from "./get/search-media.js";
import listMediaChildrenTool from "./get/list-media-children.js";
import getMediaTool from "./get/get-media.js";
import listMediaTypesTool from "./get/list-media-types.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "media",
    displayName: "Media",
    description: "Browse, search, and view media items",
  },
  tools: () => [searchMediaTool, listMediaChildrenTool, getMediaTool, listMediaTypesTool],
};

export default collection;
```

- [ ] **Step 6: Compile and verify**

Run: `npm run compile`
Expected: Clean compile.

- [ ] **Step 7: Commit**

```bash
git add src/umbraco-api/tools/media/
git commit -m "feat: add media collection with search, browse, get, list-types tools"
```

---

### Task 3: Create `media-management` collection — write tools

Use the `mcp-tool-creator` agent for each tool.

**Files:**
- Create: `src/umbraco-api/tools/media-management/index.ts`
- Create: `src/umbraco-api/tools/media-management/post/upload-media.ts`
- Create: `src/umbraco-api/tools/media-management/post/create-media-folder.ts`
- Create: `src/umbraco-api/tools/media-management/put/move-media.ts`
- Create: `src/umbraco-api/tools/media-management/put/restore-media.ts`
- Create: `src/umbraco-api/tools/media-management/delete/delete-media.ts`

- [ ] **Step 1: Create `upload-media` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `upload-media`
- Input: `filePath` (string, local file path), `name` (string, display name), optional `parentId` (uuid, target folder), optional `mediaTypeId` (uuid)
- Output: `{ message, id, name }`
- Fetch parent folder name if `parentId` provided (via `get-media-by-id`) for confirmation message
- Elicitation: `confirmAction(extra, "Upload {name} to {folder}?", { title: "Confirm upload" })`
- Delegate to: `mcpClientManager.callTool("cms", "create-media", { name, parent: { id: parentId }, mediaType: { id: mediaTypeId }, file: filePath })`
- Slices: `["create"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: false }`
- Description: `"Upload a file from a local path to the media library. Optionally specify a target folder. Call list-media-types first to find a valid media type ID. You will be asked to confirm before uploading."`

- [ ] **Step 2: Create `create-media-folder` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `create-media-folder`
- Input: `name` (string), optional `parentId` (uuid)
- Output: `{ message, id, name }`
- Elicitation: `confirmAction(extra, "Create folder {name} in {location}?", { title: "Confirm create folder" })`
- Delegate to: `mcpClientManager.callTool("cms", "create-media-folder", { name, parent: parentId ? { id: parentId } : null })`
- Slices: `["create"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: false }`
- Description: `"Create a new folder in the media library. You will be asked to confirm before creating."`

- [ ] **Step 3: Create `move-media` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `move-media`
- Input: `id` (uuid), `targetParentId` (uuid)
- Output: `{ message, id, name }`
- Fetch item name via `mcpClientManager.callTool("cms", "get-media-by-id", { id })` and target name via same for `targetParentId`
- Elicitation: `confirmAction(extra, "Move {name} to {targetFolder}?", { title: "Confirm move" })`
- Delegate to: `mcpClientManager.callTool("cms", "move-media", { id, target: { id: targetParentId } })`
- Slices: `["move"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- Description: `"Move a media item or folder to a different location in the media library. You will be asked to confirm before moving."`

- [ ] **Step 4: Create `delete-media` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `delete-media`
- Input: `id` (uuid)
- Output: `{ message, id, name }`
- Fetch item name for confirmation
- Elicitation: `confirmAction(extra, "Delete {name}? It will be moved to the recycle bin.", { title: "Confirm delete", defaultValue: false })`
- Delegate to: `mcpClientManager.callTool("cms", "move-media-to-recycle-bin", { id })`
- Slices: `["delete"]`, annotations: `{ readOnlyHint: false, destructiveHint: true, idempotentHint: false }`
- Description: `"Move a media item to the recycle bin. The item can be restored later if needed. You will be asked to confirm before deleting."`

- [ ] **Step 5: Create `restore-media` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `restore-media`
- Input: `id` (uuid)
- Output: `{ message, id, name }`
- Fetch item name for confirmation (via CMS get call on the recycle bin item)
- Elicitation: `confirmAction(extra, "Restore {name} from the recycle bin?", { title: "Confirm restore" })`
- Delegate to: `mcpClientManager.callTool("cms", "restore-media-from-recycle-bin", { id })`
- Slices: `["update"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- Description: `"Restore a media item from the recycle bin to its original location. You will be asked to confirm before restoring."`

- [ ] **Step 6: Create collection index**

Create `src/umbraco-api/tools/media-management/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import uploadMediaTool from "./post/upload-media.js";
import createMediaFolderTool from "./post/create-media-folder.js";
import moveMediaTool from "./put/move-media.js";
import deleteMediaTool from "./delete/delete-media.js";
import restoreMediaTool from "./put/restore-media.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "media-management",
    displayName: "Media Management",
    description: "Upload, organise, delete, and restore media items",
  },
  tools: () => [uploadMediaTool, createMediaFolderTool, moveMediaTool, deleteMediaTool, restoreMediaTool],
};

export default collection;
```

- [ ] **Step 7: Compile and verify**

Run: `npm run compile`
Expected: Clean compile.

- [ ] **Step 8: Commit**

```bash
git add src/umbraco-api/tools/media-management/
git commit -m "feat: add media-management collection with upload, folder, move, delete, restore tools"
```

---

### Task 4: Create `blueprint` collection

Use the `mcp-tool-creator` agent for each tool.

**Files:**
- Create: `src/umbraco-api/tools/blueprint/index.ts`
- Create: `src/umbraco-api/tools/blueprint/get/list-blueprints.ts`
- Create: `src/umbraco-api/tools/blueprint/get/get-blueprint.ts`
- Create: `src/umbraco-api/tools/blueprint/post/create-blueprint.ts`

- [ ] **Step 1: Create `list-blueprints` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `list-blueprints`
- Input: optional `parentId` (uuid, for nested folders), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, documentType }], total }`
- When `parentId` omitted: delegate to `mcpClientManager.callTool("cms", "get-document-blueprint-root", { take, skip })`
- When `parentId` provided: delegate to `mcpClientManager.callTool("cms", "get-document-blueprint-children", { parentId, take, skip })`
- Slices: `["list"]`, annotations: `{ readOnlyHint: true }`
- Description: `"List available page blueprints (templates with pre-filled content). Use get-blueprint to view a blueprint's details and property values."`

- [ ] **Step 2: Create `get-blueprint` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `get-blueprint`
- Input: `id` (uuid)
- Output: `{ id, name, documentType, values, variants }`
- Delegate to: `mcpClientManager.callTool("cms", "get-document-blueprint", { id })`
- Shape the response: extract document type name/alias, property values
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Get the full details of a page blueprint including its pre-filled property values. Blueprints are page templates that provide default content when creating new pages."`

- [ ] **Step 3: Create `create-blueprint` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `create-blueprint`
- Input: `pageId` (uuid, source page), `name` (string, blueprint name)
- Output: `{ message, id, name }`
- Fetch source page name via `mcpClientManager.callTool("cms", "get-document-by-id", { id: pageId })` for confirmation
- Elicitation: `confirmAction(extra, 'Save "${pageName}" as blueprint "${name}"?', { title: "Confirm create blueprint" })`
- Delegate to: `mcpClientManager.callTool("cms", "create-document-blueprint-from-document", { document: { id: pageId }, name })`
- Slices: `["create"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: false }`
- Description: `"Save an existing page as a reusable blueprint (template). The blueprint preserves the page's document type and property values. You will be asked to confirm before creating."`

- [ ] **Step 4: Create collection index**

Create `src/umbraco-api/tools/blueprint/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import listBlueprintsTool from "./get/list-blueprints.js";
import getBlueprintTool from "./get/get-blueprint.js";
import createBlueprintTool from "./post/create-blueprint.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "blueprint",
    displayName: "Blueprints",
    description: "List, view, and create page blueprints",
  },
  tools: () => [listBlueprintsTool, getBlueprintTool, createBlueprintTool],
};

export default collection;
```

- [ ] **Step 5: Compile and verify**

Run: `npm run compile`
Expected: Clean compile.

- [ ] **Step 6: Commit**

```bash
git add src/umbraco-api/tools/blueprint/
git commit -m "feat: add blueprint collection with list, get, create-from-page tools"
```

---

### Task 5: Register collections and wire into entry points

**Files:**
- Modify: `src/collections.ts`
- Modify: `src/index.ts` (add imports for new collections)

- [ ] **Step 1: Update collections.ts**

```typescript
import contentCollection from "./umbraco-api/tools/content/index.js";
import publishingCollection from "./umbraco-api/tools/publishing/index.js";
import versioningCollection from "./umbraco-api/tools/versioning/index.js";
import mediaCollection from "./umbraco-api/tools/media/index.js";
import mediaManagementCollection from "./umbraco-api/tools/media-management/index.js";
import blueprintCollection from "./umbraco-api/tools/blueprint/index.js";

export const collections = [
  contentCollection,
  publishingCollection,
  versioningCollection,
  mediaCollection,
  mediaManagementCollection,
  blueprintCollection,
];

export { allModes, allModeNames } from "./config/mode-registry.js";
export { allSliceNames } from "./config/slice-registry.js";
```

- [ ] **Step 2: Compile, build, and run existing tests**

Run: `npm run compile && npm run build`
Expected: Clean compile and build.

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=__tests__ --runInBand --forceExit`
Expected: All 36 existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/collections.ts
git commit -m "feat: register media, media-management, blueprint collections"
```

---

### Task 6: Review tools with mcp-tool-reviewer

- [ ] **Step 1: Run tool review**

Use the `mcp-tool-reviewer` agent to review all 12 new tools for LLM-readiness:
- `src/umbraco-api/tools/media/` (4 tools)
- `src/umbraco-api/tools/media-management/` (5 tools)
- `src/umbraco-api/tools/blueprint/` (3 tools)

- [ ] **Step 2: Apply review feedback**

Fix any description improvements, schema issues, or anti-patterns identified by the reviewer.

- [ ] **Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix: apply tool review feedback to Phase 2 tools"
```

---

### Task 7: Integration tests for `media` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/media/__tests__/media.test.ts`

- [ ] **Step 1: Create integration tests**

Use the `integration-test-creator` agent to create tests covering:
- `list-media-children`: browse root, verify item shape (id, name, mediaType, hasChildren, isFolder)
- `search-media`: search with a query, verify results have URLs
- `get-media`: get details of a known item, verify URLs and properties
- `list-media-types`: list allowed types at root
- Error path: `get-media` with non-existent UUID returns error

Tests should use `setupElicitationMock()` and `setupTestEnvironment()`.

- [ ] **Step 2: Run tests**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=media/__tests__ --runInBand --forceExit`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/umbraco-api/tools/media/__tests__/
git commit -m "test: add media collection integration tests"
```

---

### Task 8: Integration tests for `media-management` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/media-management/__tests__/media-management.test.ts`

- [ ] **Step 1: Create integration tests**

Use the `integration-test-creator` agent to create tests covering:
- Lifecycle: create-media-folder, upload-media (if test file available), move-media, delete-media, restore-media
- Elicitation accept path for all 5 write tools
- Elicitation reject path for all 5 write tools (verify "cancelled" in message)
- Error path: delete-media with non-existent UUID
- Cleanup: delete any created items in `afterAll`

Tests should use `setupElicitationMock()` and `setupTestEnvironment()`.

- [ ] **Step 2: Run tests**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=media-management/__tests__ --runInBand --forceExit`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/umbraco-api/tools/media-management/__tests__/
git commit -m "test: add media-management collection integration tests"
```

---

### Task 9: Integration tests for `blueprint` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/blueprint/__tests__/blueprint.test.ts`

- [ ] **Step 1: Create integration tests**

Use the `integration-test-creator` agent to create tests covering:
- `list-blueprints`: list root blueprints, verify item shape
- `get-blueprint`: get details of a known blueprint (if any exist), verify document type and values
- `create-blueprint`: create from an existing page + elicitation accept/reject
- Cleanup: delete created blueprints in `afterAll` (may need direct CMS call)

Tests should use `setupElicitationMock()` and `setupTestEnvironment()`.

- [ ] **Step 2: Run tests**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=blueprint/__tests__ --runInBand --forceExit`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/umbraco-api/tools/blueprint/__tests__/
git commit -m "test: add blueprint collection integration tests"
```

---

### Task 10: Eval tests for media and blueprint workflows

Use the `eval-test-creator` agent.

**Files:**
- Create: `tests/evals/media-workflows.test.ts`
- Modify: `tests/evals/read-workflows.test.ts` (update allTools array)
- Modify: `tests/evals/write-workflows.test.ts` (update allTools array)

- [ ] **Step 1: Create media/blueprint eval tests**

Use the `eval-test-creator` agent to create `tests/evals/media-workflows.test.ts` with scenarios:

1. **Media search** (read): "Find images in the media library that contain 'banner'" — requires `search-media`, success pattern: /banner|image|media/i
2. **Media details** (read): "Show me the details and URL of the company logo" — requires `get-media`, success pattern: /url|logo/i
3. **Media browse** (read): "What folders are in the media library?" — requires `list-media-children`, success pattern: /folder|media/i
4. **Media upload** (write): "Upload the file at /tmp/test-banner.jpg to the Banners folder" — requires `upload-media`, success pattern: /upload|banner/i
5. **Blueprint list** (read): "What page templates are available?" — requires `list-blueprints`, success pattern: /blueprint|template/i
6. **Blueprint create** (write): "Save the homepage as a blueprint called 'Homepage Template'" — requires `create-blueprint`, success pattern: /blueprint|template|saved/i

- [ ] **Step 2: Update allTools arrays in existing eval files**

In `tests/evals/read-workflows.test.ts` and `tests/evals/write-workflows.test.ts`, add the new tool names to the `allTools` array:

```typescript
const allTools = [
  // Content
  "search-content", "get-page", "list-children", "list-document-types",
  "inspect-blocks", "create-page", "edit-page", "edit-block", "delete-page",
  // Publishing
  "publish-page", "unpublish-page",
  // Versioning
  "list-versions", "rollback-page",
  // Media
  "search-media", "list-media-children", "get-media", "list-media-types",
  "upload-media", "create-media-folder", "move-media", "delete-media", "restore-media",
  // Blueprints
  "list-blueprints", "get-blueprint", "create-blueprint",
];
```

- [ ] **Step 3: Run eval tests**

Run: `npm run test:evals`
Expected: All evals pass (existing 16 + new 6 = 22).

- [ ] **Step 4: Commit**

```bash
git add tests/evals/
git commit -m "test: add media and blueprint eval tests"
```

---

### Task 11: Update hosted e2e test tool list

**Files:**
- Modify: `tests/hosted-e2e/mcp-inspector.test.ts`
- Modify: `tests/hosted-e2e/elicitation.test.ts`

- [ ] **Step 1: Update ALL_TOOLS arrays**

In both hosted e2e test files, update the `ALL_TOOLS` array to include the 12 new tools (25 total).

- [ ] **Step 2: Run hosted e2e tests**

Run: `npx playwright test --config tests/hosted-e2e/playwright.config.ts`
Expected: All 4 hosted e2e tests pass with the expanded tool list.

- [ ] **Step 3: Commit**

```bash
git add tests/hosted-e2e/
git commit -m "test: update hosted e2e tests for 25-tool count"
```

---

### Task 12: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run compile
npm run build
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=__tests__ --runInBand --forceExit
npm run test:evals
npx playwright test --config tests/hosted-e2e/playwright.config.ts
```

Expected:
- Compile: clean
- Build: clean
- Integration tests: ~50+ passing (36 existing + new media/blueprint tests)
- Evals: ~22 passing (16 existing + 6 new)
- Hosted e2e: 4 passing

- [ ] **Step 2: Verify tool count**

Run the server and confirm 25 tools are registered (13 existing + 12 new).

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: Phase 2 complete — 25 tools across 6 collections"
```
