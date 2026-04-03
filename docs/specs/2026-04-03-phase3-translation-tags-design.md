# Phase 3: Translation, Languages, Dictionary & Tags — Design Spec

## Overview

Add multilingual content management, language configuration, dictionary translation entries, and tag browsing to the editor MCP. Four new collections, 15 new tools. Dictionary delete intentionally excluded (can crash the site).

## Collections

### `language` (full CRUD, 5 tools)

Manage the languages configured on the Umbraco site. All write operations use elicitation.

| Tool | Purpose | CMS delegation | Slices | Elicitation |
|------|---------|---------------|--------|-------------|
| `list-languages` | List all configured languages | `get-language` | `list` | no |
| `get-language` | Get details of a language by ISO code | `get-language-by-iso-code` | `read` | no |
| `create-language` | Add a new language to the site | `create-language` | `create` | yes, default checked |
| `update-language` | Update language settings (default, mandatory, fallback) | `update-language` | `update` | yes, default checked |
| `delete-language` | Remove a language from the site | `delete-language` | `delete` | yes, destructive, default unchecked |

### `translation` (content variant workflows, 3 tools)

Purpose-built tools for multilingual content workflows. These compose multiple CMS calls into editor-friendly operations.

| Tool | Purpose | CMS delegation | Slices | Elicitation |
|------|---------|---------------|--------|-------------|
| `create-variant` | Create a new language variant for a page | `update-document` (with new culture variant) | `create` | yes, default checked |
| `copy-variant` | Copy content from one culture to another as a starting point | `get-document-by-id` + `update-document` | `create` | yes, default checked |
| `list-untranslated` | Find pages missing a specific language variant | `get-document-by-id` (batch check variants) or tree walk | `search` | no |

### `dictionary` (full CRUD, 7 tools)

Manage Umbraco's key-value translation dictionary for UI labels, buttons, and static text. Dictionary items can be nested in a tree structure.

Note: Dictionary delete is intentionally excluded — deleting dictionary items removes all translations and can crash the site if templates reference the key. This is a developer/admin operation only.

| Tool | Purpose | CMS delegation | Slices | Elicitation |
|------|---------|---------------|--------|-------------|
| `list-dictionary` | Browse dictionary tree (root or children) | `get-dictionary-root` / `get-dictionary-children` | `list`, `tree` | no |
| `search-dictionary` | Find dictionary items by key or value | `find-dictionary` | `search` | no |
| `get-dictionary` | Get a dictionary item with all translations | `get-dictionary` | `read` | no |
| `create-dictionary` | Create a new dictionary item with translations | `create-dictionary` | `create` | yes, default checked |
| `update-dictionary` | Update translations for a dictionary item | `update-dictionary-item` | `update` | yes, default checked |
| `move-dictionary` | Move a dictionary item to a different parent | `move-dictionary-item` | `move` | yes, default checked |

### `tag` (read-only, 1 tool)

Browse tags in use across the site.

| Tool | Purpose | CMS delegation | Slices | Elicitation |
|------|---------|---------------|--------|-------------|
| `get-tags` | List tags in use, optionally filtered by tag group | `get-tags` | `list` | no |

## Tool Design Details

### Language tools

**`list-languages`**
- Input: `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ isoCode, name, isDefault, isMandatory }], total }`
- Description: "List all languages configured on the Umbraco site. Shows the ISO code, name, and whether each language is the default or mandatory."

**`get-language`**
- Input: `isoCode` (string, e.g. "en-US", "da-DK")
- Output: `{ isoCode, name, isDefault, isMandatory, fallbackIsoCode }`
- Description: "Get details of a language by its ISO code. Shows default/mandatory status and fallback language."

**`create-language`**
- Input: `isoCode` (string), `isDefault` (boolean, optional), `isMandatory` (boolean, optional), `fallbackIsoCode` (string, optional)
- Output: `{ message, isoCode, name }`
- Elicitation: "Add language {name} ({isoCode}) to the site?"
- Description: "Add a new language to the Umbraco site. Use list-languages to see existing languages. You will be asked to confirm before creating."

**`update-language`**
- Input: `isoCode` (string), `isDefault` (boolean, optional), `isMandatory` (boolean, optional), `fallbackIsoCode` (string, optional)
- Output: `{ message, isoCode, name }`
- Elicitation: "Update settings for {name} ({isoCode})?"
- Description: "Update a language's settings (default, mandatory, fallback). You will be asked to confirm before updating."

**`delete-language`**
- Input: `isoCode` (string)
- Output: `{ message, isoCode, name }`
- Elicitation: "Delete language {name} ({isoCode})? All content variants in this language will become inaccessible." Default unchecked, destructive.
- Description: "Remove a language from the site. Content variants in this language will become inaccessible. You will be asked to confirm before deleting."

### Translation tools

**`create-variant`**
- Input: `id` (uuid, page ID), `culture` (string, target language ISO code), `values` (optional array of property values for the new variant)
- Output: `{ message, id, name, culture }`
- Fetches page name and checks if variant already exists before confirming
- Elicitation: "Create {culture} variant for '{pageName}'?"
- Description: "Create a new language variant for a content page. Call list-languages to find available cultures. You will be asked to confirm before creating."

**`copy-variant`**
- Input: `id` (uuid), `sourceCulture` (string), `targetCulture` (string)
- Output: `{ message, id, name, sourceCulture, targetCulture, copiedFields }`
- Fetches the page, extracts all property values for sourceCulture, writes them to targetCulture
- Elicitation: "Copy {sourceCulture} content to {targetCulture} for '{pageName}'? This will overwrite any existing {targetCulture} content."
- Description: "Copy all content from one language variant to another as a starting point for translation. Overwrites the target variant's content. You will be asked to confirm."

**`list-untranslated`**
- Input: `culture` (string, the missing language), optional `parentId` (uuid, scope to subtree), `take` (default 20), `skip` (default 0)
- Output: `{ items: [{ id, name, availableCultures }], total }`
- Walks the content tree and checks each page's variants for the specified culture
- Description: "Find content pages that are missing a specific language variant. Use this to identify pages that need translation."

### Dictionary tools

**`list-dictionary`**
- Input: optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, translatedLanguages }], total }`
- Description: "Browse the dictionary tree. Shows root entries or children of a parent. Each item shows which languages have translations."

**`search-dictionary`**
- Input: `query` (string)
- Output: `{ items: [{ id, name }], total }`
- Description: "Search for dictionary items by key name. Use get-dictionary to see all translations for a specific item."

**`get-dictionary`**
- Input: `id` (uuid)
- Output: `{ id, name, translations: [{ isoCode, languageName, translation }] }`
- Description: "Get a dictionary item with all its translations across languages. Shows the key name and each language's translation value."

**`create-dictionary`**
- Input: `name` (string, the key), `translations` (array of { isoCode, translation }), optional `parentId` (uuid)
- Output: `{ message, id, name }`
- Elicitation: "Create dictionary item '{name}' with {n} translation(s)?"
- Description: "Create a new dictionary item with translations. Dictionary items are key-value pairs used for UI labels and static text. You will be asked to confirm."

**`update-dictionary`**
- Input: `id` (uuid), `translations` (array of { isoCode, translation })
- Output: `{ message, id, name, updatedLanguages }`
- Elicitation: "Update translations for '{name}'?"
- Description: "Update translations for a dictionary item. Call get-dictionary first to see existing translations. You will be asked to confirm."

**`move-dictionary`**
- Input: `id` (uuid), `targetParentId` (uuid, optional — null for root)
- Output: `{ message, id, name }`
- Elicitation: "Move dictionary item '{name}' to {target}?"
- Description: "Move a dictionary item to a different parent in the dictionary tree. You will be asked to confirm."

### Tag tool

**`get-tags`**
- Input: `tagGroup` (string, optional — filter by group), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, group, nodeCount }], total }`
- Description: "List tags in use across the site. Optionally filter by tag group. Shows how many content items use each tag."

## Mode Registry

New modes:
- `translation` — includes `language`, `translation`, `dictionary` collections
- `tags` — includes `tag` collection

## Slice Registry

No new slices needed — all tools map to existing slices (list, read, create, update, delete, search, move, tree).

## Worker Configuration

No worker.ts changes needed. The CMS collections already include language, dictionary, and tag tools. The permissive mock user has all required sections and permissions.

## Testing

### Integration tests (per collection, using integration-test-creator agent)
- `language/__tests__/` — list, get by ISO code, create/delete lifecycle, elicitation accept/reject
- `translation/__tests__/` — create-variant, copy-variant, list-untranslated (may need a multilingual test page)
- `dictionary/__tests__/` — list, search, get, create/update lifecycle, move, elicitation accept/reject
- `tag/__tests__/` — get-tags (may return empty if no tags configured)

### Eval tests (using eval-test-creator agent)
- "What languages does this site support?" — requires list-languages
- "Create a Danish version of the homepage" — requires create-variant
- "Which pages need Danish translation?" — requires list-untranslated
- "Find the dictionary item for 'welcome'" — requires search-dictionary
- "Add a Danish translation for 'Read more'" — requires update-dictionary
- "What tags are used on the site?" — requires get-tags

## File Structure

```
src/umbraco-api/tools/
  language/
    index.ts
    get/
      list-languages.ts
      get-language.ts
    post/
      create-language.ts
    put/
      update-language.ts
    delete/
      delete-language.ts
    __tests__/
  translation/
    index.ts
    get/
      list-untranslated.ts
    post/
      create-variant.ts
      copy-variant.ts
    __tests__/
  dictionary/
    index.ts
    get/
      list-dictionary.ts
      search-dictionary.ts
      get-dictionary.ts
    post/
      create-dictionary.ts
    put/
      update-dictionary.ts
      move-dictionary.ts
    __tests__/
  tag/
    index.ts
    get/
      get-tags.ts
    __tests__/
```

## Success Criteria

- 15 new tools registered and working in both stdio and hosted modes
- All tools delegate to CMS dev MCP via mcpClientManager
- Write tools use confirmAction() with appropriate destructive warnings
- Dictionary delete has extra-strong warning about template breakage
- Integration and eval tests pass
- Total tool count: 40 (25 existing + 15 new)
