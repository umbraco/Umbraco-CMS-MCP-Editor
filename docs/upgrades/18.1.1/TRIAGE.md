# CMS tool-surface triage — `@umbraco-cms/mcp-dev` 18.0.2 → 18.1.1

Captured with `scripts/capture-cms-tool-surface.mjs` before and after the bump (permission-complete
user, so nothing is hidden behind a section or permission family).

| | before (18.0.2) | after (18.1.1) |
|---|---|---|
| CMS tools | 421 | 430 |
| sections | 9 | 9 (unchanged) |
| permission families | 2 (`Umb.Document`, `Umb.Element`) | 2 (unchanged) |

No new section or permission family, so this release adds capabilities to existing domains rather
than a new editor-facing domain (contrast the Umbraco 18 Elements/Library addition).

## New CMS tools (10) — outcome for each

| CMS tool | Outcome | Reason |
|---|---|---|
| `sort-document-children` | **Wrapped** → `sort-children-by-field` | Back office "Sort children" dialog, column-header auto-sort. No editor tool covered it — `sort-children` only handles the drag-to-explicit-order half. See `sort-children/FLOW.md`. |
| `sort-document-root-children` | **Wrapped** → `sort-children-by-field` (same tool, `parentId` omitted) | Same dialog on the Content root; mirrors how `sort-children` already treats the root. |
| `sort-media-children` | **Wrapped** → `sort-media-children-by-field` | Same dialog in the Media section. |
| `sort-media-root-children` | **Wrapped** → `sort-media-children-by-field` (same tool, `parentId` omitted) | Same, at the media root. |
| `create-and-publish-document` | Skipped | An atomic form of a flow the editor MCP already exposes as `create-page` + `publish-page`. `create-page` deliberately creates a draft and steers the LLM to the dedicated follow-up tools; collapsing that into one call would duplicate an existing path rather than add a capability. |
| `update-and-publish-document` | Skipped | Covered by `save-and-publish`, which merges individual property values via `update-document-properties` and then verifies the publish actually took effect. The new tool takes a replace-style `variants` + `values` payload, so adopting it would regress the merge semantics and lose the verification step. |
| `create-and-publish-element` | Skipped | Same reasoning as the document variant; `create-element` + `publish-element` already mirror the Library flow. |
| `update-and-publish-element` | Skipped | Same; `edit-element` + `publish-element`. |
| `get-element-published` | Skipped (follow-up candidate) | Returns a Library element's *published* variant — the element analogue of `get-document-publish`, which content's `compare-draft-to-published` consumes. There is no draft-vs-published comparison tool for elements today; adding one is a new feature, not upgrade work. |
| `get-user-batch` | Skipped | Batch user lookup by id. Back-office user administration (Settings → Users) is not an editorial flow — the editor MCP intentionally exposes only `get-current-user` from the user domain — and a batch-by-id endpoint is plumbing rather than a user-facing action. |

## Removed CMS tools (1)

| CMS tool | Impact |
|---|---|
| `update-redirect-status` | None. No `chainCms` call site referenced it (`get-redirect-status`, which `get-redirect-status` the editor tool chains, still exists). Toggling the URL tracker on/off is a Settings-level admin switch this server never wrapped. |

Every CMS tool this repo chains to was cross-checked against the post-upgrade surface: none disappeared,
and `npm run compile` is clean, so no `chainCms` input/output shape drifted either.

## Behaviour change surfaced by the CMS bump: document validation

`src/umbraco-api/tools/helpers/validate-document.ts` sent `parent: null` on every call to the chained
`validate-document` tool. That tool validates a **create** model, so Umbraco checks the document type
against the target location; a type that is not allowed at the content root now fails with
`400 / operationStatus: NotAllowed` when `parent` is null.

Under Umbraco 18.0.2 this passed; under 18.1.1 it does not. The effect was that every `edit-page`,
`edit-block`, `create-page`, `bulk-set-property` and `bulk-set-block-property` call on a **child** page
came back with `validation.valid: false` and the misleading message *"The attempted operation was not
permitted, likely due to a permission/configuration mismatch with the operation."* — nothing to do with
the page's property values. `edit-page`'s committed snapshot caught it.

Confirmed with a direct probe against the chained CMS server: validating child page "About" with
`parent: null` → 400 `NotAllowed`; the same payload with `parent: { id: <Home> }` → success. It reproduces
identically on `mcp-dev` 18.0.2, so it is the **Umbraco** bump, not the `mcp-dev` bump.

Fix: resolve the real parent via `get-document-ancestors({ descendantId })` (the chain it returns includes
the document itself, carrying its `parent`) and send that. Falls back to `null` — a genuine root document —
if the lookup fails, so validation degrades rather than throwing. `edit-page`'s snapshot is the regression
guard.
