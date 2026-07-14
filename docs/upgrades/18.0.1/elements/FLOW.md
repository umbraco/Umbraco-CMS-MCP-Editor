# Elements / Library — back-office flow trace (Umbraco 18)

Traced with Playwright driving **system Chrome** (`channel: "chrome"`) — Claude-for-Chrome can't drive
authenticated back office here (Bearer→503), but a plain Playwright Chrome instance can. Repro script:
`trace-elements.mjs` (run `node trace-elements.mjs <port>` from the repo root; logs in as admin, opens Library).

## What Elements are

A first-class, **document-like** content entity introduced in Umbraco 18, living in a new **Library** section
(top-nav "Library"). Elements are reusable, standalone content managed in a tree — the parallel of Documents
(the `content` collection) for the Media-like Library tree.

## Tree structure (see `library-section.png`)

```
Library (section)
└── Elements (root)
    ├── Categories        ← a folder (Clean 8 seeds this)
    │   └── <element items…>
    └── Recycle Bin
```

- **Root → Create** offers only **"Folder…"** (see `library-create-modal.png`) — like Media, you can only create
  folders at the root; element *items* are created inside a folder.
- Folders organise elements (`create-element-folder`, `get-element-children({ foldersOnly })`).
- Dedicated **Recycle Bin** (restore / empty), mirroring documents & media.

## Create / edit / publish flow (mirrors Documents)

- **Create an element**: inside a folder, pick a type (`documentTypeId` — an element type) + name, optional cultures
  and initial values. CMS tool `create-element({ documentTypeId, parentId, name, cultures, values })`.
- **Edit properties**: `update-element-properties({ id, properties })` — read-modify-write of individual property
  values (preferred over the wholesale `update-element`).
- **Publish / unpublish**: `publish-element` / `unpublish-element` — **workflow-approval aware** (the CMS tool notes
  to use the workflow action when approval is required), exactly like documents.
- **Versions**: `get-element-version`, `rollback-element-version`, `set-element-version-prevent-cleanup`.
- **Move / copy / delete / recycle-bin**: full parallel of the document tree operations.

## Editor-tool design (mirror the `content` collection)

| Element editor tool | Mirrors (content) | CMS tool(s) chained |
|---|---|---|
| `get-element` | `get-page` | `get-element-by-id` |
| `list-element-children` | `list-children` | `get-element-root` / `get-element-children` |
| `search-elements` | `search-content` | `search-element` |
| `create-element` | `create-page` | `create-element` (+ type/data-type lookup for editorAlias) |
| `edit-element` (update properties) | `edit-page` | `update-element-properties` |
| `publish-element` / `unpublish-element` | publishing collection | `publish-element` / `unpublish-element` |
| `delete-element` | `delete-page` | `move-element-to-recycle-bin` / `delete-element` |
| `create-element-folder` | (media folder) | `create-element-folder` |

Confirmations (`confirmAction`) mirror the back office: publish/unpublish/delete show the same intent the UI does.
