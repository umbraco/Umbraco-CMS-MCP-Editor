# Phase 3: Translation, Languages, Dictionary & Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **IMPORTANT:** Use `umbraco-mcp-skills` agents and skills for all tool, test, and eval creation. See the feedback memory `feedback_use_mcp_skills.md`.

**Goal:** Add multilingual content management (languages, content variants, dictionary translations) and tag browsing to the editor MCP — 15 new tools across 4 collections.

**Architecture:** Same delegation-to-CMS pattern as Phases 1-2. All tools call `mcpClientManager.callTool("cms", ...)`. Write tools use `confirmAction()` for elicitation. Translation tools compose multiple CMS calls into editor-friendly workflows.

**Tech Stack:** TypeScript, Zod schemas, @umbraco-cms/mcp-server-sdk, @umbraco-cms/mcp-dev (chained CMS tools)

---

### Task 1: Add `translation` and `tags` modes to registry

**Files:**
- Modify: `src/config/mode-registry.ts`

- [ ] **Step 1: Add modes**

In `src/config/mode-registry.ts`, add two new mode definitions to the `toolModes` array:

```typescript
{
  name: 'translation',
  displayName: 'Translation',
  description: 'Manage languages, content variants, and dictionary translations',
  collections: ['language', 'translation', 'dictionary']
},
{
  name: 'tags',
  displayName: 'Tags',
  description: 'Browse tags in use across the site',
  collections: ['tag']
},
```

- [ ] **Step 2: Compile and verify**

Run: `npm run compile`
Expected: Clean compile.

- [ ] **Step 3: Commit**

```bash
git add src/config/mode-registry.ts
git commit -m "feat: add translation and tags modes to registry"
```

---

### Task 2: Create `language` collection — 5 tools

Use the `mcp-tool-creator` agent to create each tool.

**Files:**
- Create: `src/umbraco-api/tools/language/index.ts`
- Create: `src/umbraco-api/tools/language/get/list-languages.ts`
- Create: `src/umbraco-api/tools/language/get/get-language.ts`
- Create: `src/umbraco-api/tools/language/post/create-language.ts`
- Create: `src/umbraco-api/tools/language/put/update-language.ts`
- Create: `src/umbraco-api/tools/language/delete/delete-language.ts`

- [ ] **Step 1: Create `list-languages` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `list-languages`
- Input: `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ isoCode, name, isDefault, isMandatory }], total }`
- Delegate to: `mcpClientManager.callTool("cms", "get-language", { take, skip })`
- Slices: `["list"]`, annotations: `{ readOnlyHint: true }`
- Description: `"List all languages configured on the Umbraco site. Shows the ISO code, name, and whether each language is the default or mandatory."`

- [ ] **Step 2: Create `get-language` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `get-language`
- Input: `isoCode` (string, e.g. "en-US")
- Output: `{ isoCode, name, isDefault, isMandatory, fallbackIsoCode }`
- Delegate to: `mcpClientManager.callTool("cms", "get-language-by-iso-code", { isoCode })`
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Get details of a language by its ISO code. Shows default/mandatory status and fallback language. Use list-languages to see all available ISO codes."`

- [ ] **Step 3: Create `create-language` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `create-language`
- Input: `isoCode` (string), `isDefault` (boolean, optional), `isMandatory` (boolean, optional), `fallbackIsoCode` (string, optional)
- Output: `{ message, isoCode, name }`
- Import `confirmAction` from SDK
- Elicitation: `confirmAction(extra, \`Add language "${isoCode}" to the site?\`, { title: "Confirm create language" })`
- Delegate to: `mcpClientManager.callTool("cms", "create-language", { isoCode, isDefault, isMandatory, fallbackIsoCode })`
- Slices: `["create"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: false }`
- Description: `"Add a new language to the Umbraco site. Use list-languages to see existing languages. You will be asked to confirm before creating."`

- [ ] **Step 4: Create `update-language` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `update-language`
- Input: `isoCode` (string), `isDefault` (boolean, optional), `isMandatory` (boolean, optional), `fallbackIsoCode` (string, optional)
- Output: `{ message, isoCode, name }`
- Fetch current language details first via `get-language-by-iso-code` for the confirmation message name
- Elicitation: `confirmAction(extra, \`Update settings for "${name}" (${isoCode})?\`, { title: "Confirm update language" })`
- Delegate to: `mcpClientManager.callTool("cms", "update-language", { isoCode, isDefault, isMandatory, fallbackIsoCode })`
- Slices: `["update"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- Description: `"Update a language's settings (default, mandatory, fallback). You will be asked to confirm before updating."`

- [ ] **Step 5: Create `delete-language` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `delete-language`
- Input: `isoCode` (string)
- Output: `{ message, isoCode, name }`
- Fetch language name first for confirmation
- Elicitation: `confirmAction(extra, \`Delete language "${name}" (${isoCode})? All content variants in this language will become inaccessible.\`, { title: "Confirm delete language", defaultValue: false })`
- Delegate to: `mcpClientManager.callTool("cms", "delete-language", { isoCode })`
- Slices: `["delete"]`, annotations: `{ readOnlyHint: false, destructiveHint: true, idempotentHint: false }`
- Description: `"Remove a language from the site. Content variants in this language will become inaccessible. You will be asked to confirm before deleting."`

- [ ] **Step 6: Create collection index**

Create `src/umbraco-api/tools/language/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import listLanguagesTool from "./get/list-languages.js";
import getLanguageTool from "./get/get-language.js";
import createLanguageTool from "./post/create-language.js";
import updateLanguageTool from "./put/update-language.js";
import deleteLanguageTool from "./delete/delete-language.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "language",
    displayName: "Languages",
    description: "Manage languages configured on the Umbraco site",
  },
  tools: () => [listLanguagesTool, getLanguageTool, createLanguageTool, updateLanguageTool, deleteLanguageTool],
};

export default collection;
```

- [ ] **Step 7: Compile and commit**

Run: `npm run compile`
Expected: Clean compile.

```bash
git add src/umbraco-api/tools/language/
git commit -m "feat: add language collection with list, get, create, update, delete tools"
```

---

### Task 3: Create `translation` collection — 3 tools

Use the `mcp-tool-creator` agent for each tool. These tools are more complex — they compose multiple CMS calls.

**Files:**
- Create: `src/umbraco-api/tools/translation/index.ts`
- Create: `src/umbraco-api/tools/translation/post/create-variant.ts`
- Create: `src/umbraco-api/tools/translation/post/copy-variant.ts`
- Create: `src/umbraco-api/tools/translation/get/list-untranslated.ts`

- [ ] **Step 1: Create `create-variant` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `create-variant`
- Input: `id` (uuid, page ID), `culture` (string, target language ISO code), `values` (optional array of `{ alias, value, culture?, segment? }`)
- Output: `{ message, id, name, culture }`
- Step 1: Fetch page via `mcpClientManager.callTool("cms", "get-document-by-id", { id })` to get page name and check if variant already exists
- If variant for `culture` already exists in the page's variants, return error "Variant already exists"
- Step 2: Elicitation: `confirmAction(extra, \`Create ${culture} variant for "${pageName}"?\`, { title: "Confirm create variant" })`
- Step 3: Build update payload — add a new variant entry with the culture, and include any provided values with the culture set
- Delegate to: `mcpClientManager.callTool("cms", "update-document", { id, values: [...existingValues, ...newValues], variants: [...existingVariants, { culture, name: pageName }] })`
- Slices: `["create"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: false }`
- Description: `"Create a new language variant for a content page. Call list-languages to find available cultures. Optionally provide property values for the new variant. You will be asked to confirm before creating."`

- [ ] **Step 2: Create `copy-variant` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `copy-variant`
- Input: `id` (uuid), `sourceCulture` (string), `targetCulture` (string)
- Output: `{ message, id, name, sourceCulture, targetCulture, copiedFields }`
- Step 1: Fetch page via `get-document-by-id` to get all values
- Step 2: Filter values where `culture === sourceCulture`, then create copies with `culture = targetCulture`
- Step 3: Elicitation: `confirmAction(extra, \`Copy ${sourceCulture} content to ${targetCulture} for "${pageName}"? This will overwrite any existing ${targetCulture} content.\`, { title: "Confirm copy variant" })`
- Step 4: Merge copied values into existing values (replacing any existing targetCulture values for the same aliases)
- Delegate to: `mcpClientManager.callTool("cms", "update-document", { id, values: mergedValues, variants: updatedVariants })`
- Slices: `["create"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- Description: `"Copy all content from one language variant to another as a starting point for translation. Overwrites the target variant's content. You will be asked to confirm."`

- [ ] **Step 3: Create `list-untranslated` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `list-untranslated`
- Input: `culture` (string, the missing language), optional `parentId` (uuid), `take` (default 20), `skip` (default 0)
- Output: `{ items: [{ id, name, availableCultures }], total }`
- Step 1: Get children of parentId (or root) via `mcpClientManager.callTool("cms", "get-tree-document-children", { parentId, take, skip })` or `get-tree-document-root` if no parentId
- Step 2: For each child, check if it has a variant for `culture` by calling `get-document-by-id` and inspecting variants
- Step 3: Return only pages that do NOT have the specified culture variant
- This is a read-only operation — no elicitation needed
- Slices: `["search"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Find content pages that are missing a specific language variant. Use this to identify pages that need translation. Call list-languages to find valid culture codes."`

- [ ] **Step 4: Create collection index**

Create `src/umbraco-api/tools/translation/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import createVariantTool from "./post/create-variant.js";
import copyVariantTool from "./post/copy-variant.js";
import listUntranslatedTool from "./get/list-untranslated.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "translation",
    displayName: "Translation",
    description: "Create and manage language variants for content pages",
  },
  tools: () => [createVariantTool, copyVariantTool, listUntranslatedTool],
};

export default collection;
```

- [ ] **Step 5: Compile and commit**

Run: `npm run compile`
Expected: Clean compile.

```bash
git add src/umbraco-api/tools/translation/
git commit -m "feat: add translation collection with create-variant, copy-variant, list-untranslated"
```

---

### Task 4: Create `dictionary` collection — 6 tools

Use the `mcp-tool-creator` agent for each tool.

**Files:**
- Create: `src/umbraco-api/tools/dictionary/index.ts`
- Create: `src/umbraco-api/tools/dictionary/get/list-dictionary.ts`
- Create: `src/umbraco-api/tools/dictionary/get/search-dictionary.ts`
- Create: `src/umbraco-api/tools/dictionary/get/get-dictionary.ts`
- Create: `src/umbraco-api/tools/dictionary/post/create-dictionary.ts`
- Create: `src/umbraco-api/tools/dictionary/put/update-dictionary.ts`
- Create: `src/umbraco-api/tools/dictionary/put/move-dictionary.ts`

- [ ] **Step 1: Create `list-dictionary` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `list-dictionary`
- Input: optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, translatedLanguages }], total }`
- When `parentId` omitted: delegate to `mcpClientManager.callTool("cms", "get-dictionary-root", { take, skip })`
- When `parentId` provided: delegate to `mcpClientManager.callTool("cms", "get-dictionary-children", { parentId, take, skip })`
- `translatedLanguages`: extract from the CMS response's translations array
- Slices: `["list", "tree"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Browse the dictionary tree. Shows root entries or children of a parent. Each item shows which languages have translations. Use get-dictionary to see the full translations."`

- [ ] **Step 2: Create `search-dictionary` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `search-dictionary`
- Input: `query` (string)
- Output: `{ items: [{ id, name }], total }`
- Delegate to: `mcpClientManager.callTool("cms", "find-dictionary", { query })`
- Slices: `["search"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Search for dictionary items by key name. Use get-dictionary to see all translations for a specific item."`

- [ ] **Step 3: Create `get-dictionary` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `get-dictionary`
- Input: `id` (uuid)
- Output: `{ id, name, translations: [{ isoCode, languageName, translation }] }`
- Delegate to: `mcpClientManager.callTool("cms", "get-dictionary", { id })`
- Shape: extract translations array with isoCode, language display name, and translation value
- Slices: `["read"]`, annotations: `{ readOnlyHint: true }`
- Description: `"Get a dictionary item with all its translations across languages. Shows the key name and each language's translation value."`

- [ ] **Step 4: Create `create-dictionary` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `create-dictionary`
- Input: `name` (string, the key), `translations` (array of `{ isoCode, translation }`), optional `parentId` (uuid)
- Output: `{ message, id, name }`
- Elicitation: `confirmAction(extra, \`Create dictionary item "${name}" with ${translations.length} translation(s)?\`, { title: "Confirm create dictionary item" })`
- Delegate to: `mcpClientManager.callTool("cms", "create-dictionary", { name, translations, parent: parentId ? { id: parentId } : null })`
- Slices: `["create"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: false }`
- Description: `"Create a new dictionary item with translations. Dictionary items are key-value pairs used for UI labels and static text. You will be asked to confirm."`

- [ ] **Step 5: Create `update-dictionary` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `update-dictionary`
- Input: `id` (uuid), `translations` (array of `{ isoCode, translation }`)
- Output: `{ message, id, name, updatedLanguages }`
- Fetch existing dictionary item via `get-dictionary` for the name and to merge translations
- Elicitation: `confirmAction(extra, \`Update translations for "${name}"?\`, { title: "Confirm update dictionary" })`
- Delegate to: `mcpClientManager.callTool("cms", "update-dictionary-item", { id, translations: mergedTranslations })`
- Slices: `["update"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- Description: `"Update translations for a dictionary item. Call get-dictionary first to see existing translations. You will be asked to confirm."`

- [ ] **Step 6: Create `move-dictionary` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `move-dictionary`
- Input: `id` (uuid), `targetParentId` (uuid, optional — omit for root)
- Output: `{ message, id, name }`
- Fetch item name via `get-dictionary` for confirmation
- Elicitation: `confirmAction(extra, \`Move dictionary item "${name}" to ${target}?\`, { title: "Confirm move dictionary" })`
- Delegate to: `mcpClientManager.callTool("cms", "move-dictionary-item", { id, target: targetParentId ? { id: targetParentId } : null })`
- Slices: `["move"]`, annotations: `{ readOnlyHint: false, destructiveHint: false, idempotentHint: true }`
- Description: `"Move a dictionary item to a different parent in the dictionary tree, or to the root. You will be asked to confirm."`

- [ ] **Step 7: Create collection index**

Create `src/umbraco-api/tools/dictionary/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import listDictionaryTool from "./get/list-dictionary.js";
import searchDictionaryTool from "./get/search-dictionary.js";
import getDictionaryTool from "./get/get-dictionary.js";
import createDictionaryTool from "./post/create-dictionary.js";
import updateDictionaryTool from "./put/update-dictionary.js";
import moveDictionaryTool from "./put/move-dictionary.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "dictionary",
    displayName: "Dictionary",
    description: "Manage translation dictionary entries for UI labels and static text",
  },
  tools: () => [listDictionaryTool, searchDictionaryTool, getDictionaryTool, createDictionaryTool, updateDictionaryTool, moveDictionaryTool],
};

export default collection;
```

- [ ] **Step 8: Compile and commit**

Run: `npm run compile`
Expected: Clean compile.

```bash
git add src/umbraco-api/tools/dictionary/
git commit -m "feat: add dictionary collection with list, search, get, create, update, move tools"
```

---

### Task 5: Create `tag` collection — 1 tool

Use the `mcp-tool-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/tag/index.ts`
- Create: `src/umbraco-api/tools/tag/get/get-tags.ts`

- [ ] **Step 1: Create `get-tags` tool**

Use the `mcp-tool-creator` agent. The tool should:
- Name: `get-tags`
- Input: `tagGroup` (string, optional — filter by group), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, group, nodeCount }], total }`
- Delegate to: `mcpClientManager.callTool("cms", "get-tags", { tagGroup, take, skip })`
- Slices: `["list"]`, annotations: `{ readOnlyHint: true }`
- Description: `"List tags in use across the site. Optionally filter by tag group. Shows how many content items use each tag."`

- [ ] **Step 2: Create collection index**

Create `src/umbraco-api/tools/tag/index.ts`:

```typescript
import { ToolCollectionExport } from "@umbraco-cms/mcp-server-sdk";
import getTagsTool from "./get/get-tags.js";

const collection: ToolCollectionExport = {
  metadata: {
    name: "tag",
    displayName: "Tags",
    description: "Browse tags in use across the site",
  },
  tools: () => [getTagsTool],
};

export default collection;
```

- [ ] **Step 3: Compile and commit**

Run: `npm run compile`
Expected: Clean compile.

```bash
git add src/umbraco-api/tools/tag/
git commit -m "feat: add tag collection with get-tags tool"
```

---

### Task 6: Register collections and wire into entry points

**Files:**
- Modify: `src/collections.ts`

- [ ] **Step 1: Update collections.ts**

Add the 4 new collection imports and register them:

```typescript
import contentCollection from "./umbraco-api/tools/content/index.js";
import publishingCollection from "./umbraco-api/tools/publishing/index.js";
import versioningCollection from "./umbraco-api/tools/versioning/index.js";
import mediaCollection from "./umbraco-api/tools/media/index.js";
import mediaManagementCollection from "./umbraco-api/tools/media-management/index.js";
import blueprintCollection from "./umbraco-api/tools/blueprint/index.js";
import languageCollection from "./umbraco-api/tools/language/index.js";
import translationCollection from "./umbraco-api/tools/translation/index.js";
import dictionaryCollection from "./umbraco-api/tools/dictionary/index.js";
import tagCollection from "./umbraco-api/tools/tag/index.js";

export const collections = [
  contentCollection,
  publishingCollection,
  versioningCollection,
  mediaCollection,
  mediaManagementCollection,
  blueprintCollection,
  languageCollection,
  translationCollection,
  dictionaryCollection,
  tagCollection,
];
```

Also update `src/index.ts` if the new collections are not yet imported there (they need to be registered in the stdio entry point too).

- [ ] **Step 2: Compile, build, and run existing tests**

Run: `npm run compile && npm run build`
Expected: Clean compile and build.

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=__tests__ --runInBand --forceExit`
Expected: All 56 existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/collections.ts src/index.ts
git commit -m "feat: register language, translation, dictionary, tag collections"
```

---

### Task 7: Review tools with mcp-tool-reviewer

- [ ] **Step 1: Run tool review**

Use the `mcp-tool-reviewer` agent to review all 15 new tools:
- `src/umbraco-api/tools/language/` (5 tools)
- `src/umbraco-api/tools/translation/` (3 tools)
- `src/umbraco-api/tools/dictionary/` (6 tools)
- `src/umbraco-api/tools/tag/` (1 tool)

- [ ] **Step 2: Apply review feedback**

Fix any issues identified by the reviewer.

- [ ] **Step 3: Commit fixes**

```bash
git add -A
git commit -m "fix: apply tool review feedback to Phase 3 tools"
```

---

### Task 8: Integration tests for `language` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/language/__tests__/language.test.ts`

- [ ] **Step 1: Create integration tests**

Use the `integration-test-creator` agent. Tests should cover:
- `list-languages`: list all, verify item shape (isoCode, name, isDefault, isMandatory)
- `get-language`: get by ISO code (use the default language from list), verify shape
- `create-language` + `delete-language` lifecycle: create a test language (e.g. "nb-NO"), verify, delete, verify. Elicitation accept for both.
- `update-language`: update a non-default setting on the test language before deleting
- Elicitation rejection tests for create, update, delete
- Error path: get-language with invalid ISO code

Tests should use `setupElicitationMock()` and `setupTestEnvironment()`.

- [ ] **Step 2: Run tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=language/__tests__ --runInBand --forceExit
git add src/umbraco-api/tools/language/__tests__/
git commit -m "test: add language collection integration tests"
```

---

### Task 9: Integration tests for `translation` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/translation/__tests__/translation.test.ts`

- [ ] **Step 1: Create integration tests**

Use the `integration-test-creator` agent. Tests should cover:
- `list-untranslated`: list pages missing a non-default culture, verify structure
- `create-variant`: create a variant for a test page (requires multilingual setup — guard with skip if only one language)
- `copy-variant`: copy content from default to another culture
- Elicitation rejection tests for create-variant and copy-variant
- Note: these tests depend on a multilingual Umbraco instance. Guard with `if (!hasMultipleLanguages) { console.warn(...); return; }`

Tests should use `setupElicitationMock()` and `setupTestEnvironment()`.

- [ ] **Step 2: Run tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=translation/__tests__ --runInBand --forceExit
git add src/umbraco-api/tools/translation/__tests__/
git commit -m "test: add translation collection integration tests"
```

---

### Task 10: Integration tests for `dictionary` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/dictionary/__tests__/dictionary.test.ts`

- [ ] **Step 1: Create integration tests**

Use the `integration-test-creator` agent. Tests should cover:
- `list-dictionary`: browse root, verify item shape (id, name, translatedLanguages)
- `search-dictionary`: search for a term, verify structure
- `get-dictionary`: get by ID (from list), verify translations array
- Lifecycle: `create-dictionary` → `update-dictionary` → `move-dictionary`. Cleanup by deleting via direct CMS call in afterAll.
- Elicitation rejection tests for create, update, move
- Error path: get-dictionary with non-existent UUID

Tests should use `setupElicitationMock()` and `setupTestEnvironment()`.

- [ ] **Step 2: Run tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=dictionary/__tests__ --runInBand --forceExit
git add src/umbraco-api/tools/dictionary/__tests__/
git commit -m "test: add dictionary collection integration tests"
```

---

### Task 11: Integration tests for `tag` collection

Use the `integration-test-creator` agent.

**Files:**
- Create: `src/umbraco-api/tools/tag/__tests__/tag.test.ts`

- [ ] **Step 1: Create integration tests**

Use the `integration-test-creator` agent. Tests should cover:
- `get-tags`: list all tags, verify structure (items array with id, name, group, nodeCount). May return empty — that's fine.
- `get-tags` with tagGroup filter: verify filtering works (may return empty)

Tests should use `setupElicitationMock()` and `setupTestEnvironment()`.

- [ ] **Step 2: Run tests and commit**

```bash
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=tag/__tests__ --runInBand --forceExit
git add src/umbraco-api/tools/tag/__tests__/
git commit -m "test: add tag collection integration tests"
```

---

### Task 12: Eval tests for translation and tag workflows

Use the `eval-test-creator` agent.

**Files:**
- Create: `tests/evals/translation-workflows.test.ts`
- Modify: `tests/evals/read-workflows.test.ts` (update allTools array)
- Modify: `tests/evals/write-workflows.test.ts` (update allTools array)
- Modify: `tests/evals/media-workflows.test.ts` (update allTools array)

- [ ] **Step 1: Create eval tests**

Use the `eval-test-creator` agent to create `tests/evals/translation-workflows.test.ts` with scenarios:

1. "What languages does this site support?" — requires `list-languages`, success pattern: /language|english/i
2. "Create a Danish version of the homepage" — requires `create-variant`, success pattern: /variant|danish|da/i
3. "Which pages need Danish translation?" — requires `list-untranslated`, success pattern: /untranslated|missing|danish/i
4. "Find the dictionary item for 'welcome'" — requires `search-dictionary`, success pattern: /dictionary|welcome/i
5. "Add a Danish translation for the 'Read more' dictionary item" — requires `update-dictionary`, success pattern: /dictionary|updated|translation/i
6. "What tags are used on the site?" — requires `get-tags`, success pattern: /tag/i

- [ ] **Step 2: Update allTools arrays in all existing eval files**

Add the 15 new tool names to `allTools` in:
- `tests/evals/read-workflows.test.ts`
- `tests/evals/write-workflows.test.ts`
- `tests/evals/media-workflows.test.ts`

New tools to add:
```typescript
// Languages
"list-languages", "get-language", "create-language", "update-language", "delete-language",
// Translation
"create-variant", "copy-variant", "list-untranslated",
// Dictionary
"list-dictionary", "search-dictionary", "get-dictionary", "create-dictionary", "update-dictionary", "move-dictionary",
// Tags
"get-tags",
```

- [ ] **Step 3: Run evals and commit**

Run: `npm run test:evals`
Expected: All evals pass.

```bash
git add tests/evals/
git commit -m "test: add translation and tag eval tests, update allTools arrays"
```

---

### Task 13: Update hosted e2e test tool list

**Files:**
- Modify: `tests/hosted-e2e/mcp-inspector.test.ts`
- Modify: `tests/hosted-e2e/elicitation.test.ts`

- [ ] **Step 1: Update ALL_TOOLS arrays**

Add the 15 new tool names to both hosted e2e files (40 tools total).

- [ ] **Step 2: Run hosted e2e tests**

Run: `HEADLESS=true npx playwright test --config tests/hosted-e2e/playwright.config.ts`
Expected: All 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/hosted-e2e/
git commit -m "test: update hosted e2e tests for 40-tool count"
```

---

### Task 14: Final verification

- [ ] **Step 1: Run full test suite**

```bash
npm run compile
npm run build
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern=__tests__ --runInBand --forceExit
npm run test:evals
HEADLESS=true npx playwright test --config tests/hosted-e2e/playwright.config.ts
```

Expected:
- Compile: clean
- Build: clean
- Integration tests: ~70+ passing
- Evals: ~28 passing
- Hosted e2e: 4 passing

- [ ] **Step 2: Verify tool count**

Confirm 40 tools are registered (25 existing + 15 new).

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore: Phase 3 complete — 40 tools across 10 collections"
```
