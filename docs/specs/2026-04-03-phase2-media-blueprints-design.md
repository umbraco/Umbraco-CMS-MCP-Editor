# Phase 2: Media & Blueprints — Design Spec

## Overview

Add media library management and blueprint (page template) support to the editor MCP. Three new collections, 12 new tools, following the same delegation-to-CMS pattern as Phase 1.

## Collections

### `media` (read-only, 4 tools)

Browse, search, and inspect the media library.

| Tool | Purpose | CMS delegation | Slices | Annotations |
|------|---------|---------------|--------|-------------|
| `search-media` | Find media items by name/filter, optionally scoped to a folder | `get-collection-media` + `get-media-urls` | `search` | readOnly |
| `list-media-children` | Browse the media tree (root or children of a folder) | `get-media-children` / `get-media-root` | `tree` | readOnly |
| `get-media` | Full details of a media item including URLs, dimensions, file info | `get-media-by-id` + `get-media-urls` | `read` | readOnly |
| `list-media-types` | List allowed media types (Image, File, Folder, etc.) | `get-media-type-allowed-at-root` / `get-media-type-allowed-children` | `list` | readOnly |

### `media-management` (write, 5 tools)

Upload, organise, delete, and restore media items.

| Tool | Purpose | CMS delegation | Slices | Annotations |
|------|---------|---------------|--------|-------------|
| `upload-media` | Upload a file from a local path | `create-media` | `create` | not readOnly, not destructive |
| `create-media-folder` | Create a new folder in the media library | `create-media-folder` | `create` | not readOnly, not destructive |
| `move-media` | Move a media item to a different folder | `move-media` | `move` | not readOnly, not destructive |
| `delete-media` | Move a media item to the recycle bin | `move-media-to-recycle-bin` | `delete` | destructive, default unchecked |
| `restore-media` | Restore a media item from the recycle bin | `restore-media-from-recycle-bin` | `update` | not readOnly, not destructive |

### `blueprint` (read + create, 3 tools)

List, view, and create page blueprints (templates with pre-filled content).

| Tool | Purpose | CMS delegation | Slices | Annotations |
|------|---------|---------------|--------|-------------|
| `list-blueprints` | List available page blueprints | `get-document-blueprint-root` / `get-document-blueprint-children` | `list` | readOnly |
| `get-blueprint` | View a blueprint's details and pre-filled property values | `get-document-blueprint` | `read` | readOnly |
| `create-blueprint` | Save an existing page as a reusable blueprint | `create-document-blueprint-from-document` | `create` | not readOnly, not destructive |

## Tool Design Details

### Media read tools

**`search-media`**
- Input: `query` (filter string), optional `parentId` (scope to folder), `take`, `skip`
- Output: `{ items: [{ id, name, mediaType, url }], total }`
- Combines `get-collection-media` (with `filter` param) and `get-media-urls` to include URLs in results
- Description should mention using `get-media` for full details and `list-media-children` for folder browsing

**`list-media-children`**
- Input: optional `parentId` (omit for root), `take`, `skip`
- Output: `{ items: [{ id, name, mediaType, hasChildren, isFolder }], total }`
- Mirrors the `list-children` pattern from content collection
- `isFolder` flag lets the LLM distinguish folders from media items
- `hasChildren` enables tree traversal

**`get-media`**
- Input: `id`
- Output: name, mediaType, urls (array of { url, culture }), width, height, fileSize, extension, property values
- Merges `get-media-by-id` and `get-media-urls` into a single response
- Description should cross-reference `search-media` for finding items

**`list-media-types`**
- Input: optional `parentId` (to show what's allowed in a specific folder)
- Output: `{ items: [{ id, alias, name, icon }], total }`
- Used before `upload-media` to find the correct media type
- Delegates to `get-media-type-allowed-at-root` (no parent) or `get-media-type-allowed-children` (with parent)

### Media write tools

All write tools use `confirmAction()` from the base SDK for elicitation.

**`upload-media`**
- Input: `filePath` (local path to file), `name` (display name), optional `parentId` (target folder), optional `mediaTypeId`
- Elicitation: "Upload {filename} to {folder}?" (default: checked)
- Delegates to CMS `create-media` which handles the file read and upload
- Description should mention `list-media-types` for finding media type IDs and `list-media-children` for finding folder IDs

**`create-media-folder`**
- Input: `name`, optional `parentId`
- Elicitation: "Create folder {name} in {location}?" (default: checked)
- Delegates to CMS `create-media-folder`

**`move-media`**
- Input: `id`, `targetParentId`
- Fetches item name via `get-media-by-id` for human-readable confirmation
- Elicitation: "Move {name} to {targetFolder}?" (default: checked)
- Delegates to CMS `move-media`

**`delete-media`**
- Input: `id`
- Fetches item name for confirmation
- Elicitation: "Delete {name}? It will be moved to the recycle bin." (default: unchecked — destructive)
- Delegates to CMS `move-media-to-recycle-bin`

**`restore-media`**
- Input: `id`
- Elicitation: "Restore {name} from the recycle bin?" (default: checked)
- Delegates to CMS `restore-media-from-recycle-bin`

### Blueprint tools

**`list-blueprints`**
- Input: optional `parentId` (for nested blueprint folders), `take`, `skip`
- Output: `{ items: [{ id, name, documentType }], total }`
- Delegates to `get-document-blueprint-root` (no parent) or `get-document-blueprint-children`

**`get-blueprint`**
- Input: `id`
- Output: name, documentType (name + alias), property values (pre-filled content)
- Delegates to `get-document-blueprint`
- Description should explain that blueprints are page templates with pre-filled values

**`create-blueprint`**
- Input: `pageId` (source page to save as blueprint), `name` (blueprint name)
- Elicitation: "Save {pageName} as blueprint {name}?" (default: checked)
- Delegates to `create-document-blueprint-from-document`

## Mode Registry

New modes added to `config/mode-registry.ts`:

- `media` — includes `media` + `media-management` collections
- `blueprints` — includes `blueprint` collection

Users enable with `UMBRACO_TOOL_MODES=editor,media,blueprints`.

## Worker Configuration

No worker.ts changes needed. The CMS collections registered for in-process chaining already include media and blueprint tools. The permissive mock user already has `Umb.Section.Media` in `allowedSections`.

## Testing

### Integration tests

Created using `integration-test-creator` agent:

- `media/__tests__/media.test.ts` — list-media-children (root + folder), search-media, get-media details with URLs, list-media-types, error path for non-existent ID
- `media-management/__tests__/media-management.test.ts` — lifecycle: create folder, upload file, move to folder, delete (recycle bin), restore. Elicitation accept + reject for all 5 write tools.
- `blueprint/__tests__/blueprint.test.ts` — list-blueprints, get-blueprint, create-blueprint from page + elicitation accept/reject

All tests use `setupElicitationMock()` from the base SDK.

### Eval tests

Created using `eval-test-creator` agent:

- Media search: "find images in the banners folder"
- Media details: "what's the URL of the company logo"
- Media upload: "upload the file at /path/to/banner.jpg to the Banners folder"
- Blueprint list: "what page templates are available"
- Blueprint create: "save this page as a blueprint called Blog Template"

## File Structure

```
src/umbraco-api/tools/
  media/
    index.ts                    # ToolCollectionExport (media read)
    get/
      search-media.ts
      list-media-children.ts
      get-media.ts
      list-media-types.ts
    __tests__/
      media.test.ts
  media-management/
    index.ts                    # ToolCollectionExport (media write)
    post/
      upload-media.ts
      create-media-folder.ts
    put/
      move-media.ts
      restore-media.ts
    delete/
      delete-media.ts
    __tests__/
      media-management.test.ts
  blueprint/
    index.ts                    # ToolCollectionExport
    get/
      list-blueprints.ts
      get-blueprint.ts
    post/
      create-blueprint.ts
    __tests__/
      blueprint.test.ts
```

## Success Criteria

- 12 new tools registered and working in both stdio and hosted modes
- All tools delegate to CMS dev MCP via `mcpClientManager.callTool("cms", ...)`
- Write tools use `confirmAction()` for elicitation
- Integration tests pass against a real Umbraco instance
- Eval tests pass with correct tool selection
- Hosted e2e tests continue to pass (existing 4 + any new ones)
- Total tool count: 25 (13 existing + 12 new)
