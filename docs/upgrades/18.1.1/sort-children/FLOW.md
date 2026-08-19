# "Sort children" — back-office flow trace (Umbraco 18.1.1)

Traced live with Playwright against the running demo site (`trace-sort-children.mjs <baseUrl>`, run from the
repo root; logs in as `admin@admin.com`, opens the Content section, hovers the **Home** node and opens its
entity-actions menu). Chromium was launched from the pre-cached browser in this environment via
`executablePath` — adjust or drop that when re-running elsewhere.

This trace backs the two editor tools added for the `@umbraco-cms/mcp-dev@18.1.1` upgrade:
`sort-children-by-field` (content) and `sort-media-children-by-field` (media).

## Entry point & context

`01-tree-actions-menu.png` — hover a node in the Content tree → **…** (actions) → **Sort children…**.
The action is on the *parent*: it reorders that node's children. The Content root has the same action on
its own **…** menu, which is why the editor tools make `parentId` optional (omitted = content/media root)
and chain to the `*-root-children` CMS tools in that case.

The Media section has the identical action on media folders and the media root.

## The dialog

`02-sort-children-dialog.png` — a modal titled **"Sort children"** containing:

- one row per child, each with a **drag handle** for manual reordering;
- clickable column headers: **Name** and **Created**;
- footer buttons **Cancel** and **Sort** (primary).

Two distinct interactions, and Umbraco 18.1 backs them with two distinct sets of endpoints:

| UI interaction | CMS tool (new in mcp-dev 18.1.1 unless noted) | Editor tool |
|---|---|---|
| Drag rows into an explicit order | `sort-document` / `sort-media` (pre-existing) | `sort-children` / `sort-media-children` |
| Click a column header to auto-sort | `sort-document-children` / `sort-document-root-children` / `sort-media-children` / `sort-media-root-children` | `sort-children-by-field` / `sort-media-children-by-field` |

The auto-sort half had no editor tool before this upgrade — that is the gap these two tools close.

## Inputs the user provides

- **Field** — whichever column header is clicked. The dialog exposes **Name** and **Created**; the endpoint
  additionally accepts `UpdateDate` (last edited), so the tools expose all three and say so in the field
  description.
- **Direction** — derived from repeated clicks on the same header, *not* a separate control:
  - `03-name-ascending.png` — first click on **Name** → ascending (About → XMLSitemap), caret shown on the header.
  - `04-name-descending.png` — second click → descending (XMLSitemap → About).
  This is why `direction` defaults to `Ascending` in both tools.
- **Culture** — variant content sorts on the names/dates of one culture. Exposed as an optional `culture` on
  the content tool; media is invariant, so the media tool has no culture input.

## Confirmations & warnings

None. Sorting is non-destructive; the dialog's only gate is the explicit **Sort** button versus **Cancel**.
Neither editor tool calls `confirmAction`, matching `sort-children` / `sort-media-children`.

## Sequencing

Single step — no save-then-do-something-else. The tools issue one chained sort call.

## End state & feedback

The dialog's list is left showing the children in their new order, and the tree reflects it. Both editor
tools mirror that: after the sort they read the children back (`get-document-children` /
`get-document-root`, `get-media-children` / `get-media-root`) and return them in the new order as `items`,
plus a `message` naming the field and direction. The content tool also returns `parentPreviewUrl`, matching
`sort-children`.
