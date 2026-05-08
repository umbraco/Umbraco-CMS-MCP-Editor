# Save and Preview → Preview URLs on Existing Tools

## Problem

The Umbraco UI has a **"Save and preview"** button in the workspace footer. It saves the current draft and opens a preview window showing how the page will render on the live site without publishing.

An MCP tool can't literally *show* a preview — it operates in text, not a browser. But the underlying value is giving the editor a link they can click to see their changes, and that is something we can surface.

## UI Workflow (Reproduction Steps)

1. Navigate to Content section
2. Open any content node
3. Make changes to properties
4. Click **"Save and preview"** (leftmost footer button)
5. Content is saved as draft
6. A preview window/panel opens showing the rendered page

## Assessment

Rather than a dedicated `save-and-preview` or `get-preview-url` tool, fold URL information into the output of the tools that already do the work:

- `edit-page` → returns `previewUrl` (draft view)
- `save-and-publish` → returns `publishedUrl` (live page)
- `get-page` → returns both, nullable

**No opt-in flag.** Always include the URL when it can be resolved. An opt-in parameter is a knob the LLM has to know to turn; always-on removes the failure mode where the model forgets to ask and the editor ends up navigating to the page manually. Extra output fields are cheap — the LLM can ignore them, and when relevant it can offer the link unprompted.

**Recommendation: Extend existing tools, don't add new ones.**

## Important Caveat: Preview URLs Require Auth

Umbraco preview is cookie-gated — the preview URL only renders draft content if the viewer has an active backoffice session in the same browser. It is **not a shareable link**.

The tool output needs to communicate this so the LLM doesn't promise "here's a link you can send to your colleague." Options:

- Return a sibling boolean: `previewRequiresAuth: true`
- Cover it in the field description on the output schema
- Return a small object: `{ url, requiresBackofficeAuth: true }`

The object form is probably clearest — the LLM sees the shape and naturally mentions the constraint.

## Dev MCP Support

- `get-document-urls` — returns the **published** routes for a document (one per culture/hostname). Can be chained directly from `save-and-publish` and `get-page`.
- **Preview URL** — no direct dev-MCP tool found. Umbraco's convention is `{siteBase}/umbraco/preview/?id={documentId}`. We can construct client-side from `UMBRACO_BASE_URL` + the document ID, unless a more specific dev-MCP tool shows up later.

## Implementation Notes

Three tools to touch:

**`edit-page` (content/put/edit-page.ts):**
- Add `previewUrl: { url: string, requiresBackofficeAuth: true } | null` to output schema
- Construct the preview URL from base URL + id after successful save

**`save-and-publish` (publishing/post/save-and-publish.ts):**
- Add `publishedUrls: string[]` to output schema (array — a page can have multiple routes under multi-culture / multi-domain setups)
- After successful publish, chain `get-document-urls` and flatten to URL strings
- If the call fails or returns empty, output `[]` — never throw

**`get-page` (content/get/get-page.ts):**
- Add both fields: `previewUrl` (always constructable) and `publishedUrls` (only for published pages)

No new tool, no opt-in flag.

## Scope

Small: schema additions + one extra chained call each on `edit-page` / `save-and-publish` / `get-page`. Tests need updating to cover the new output fields (snapshot normalisation will need to handle the URLs — likely replace with `<preview-url>` / `<published-url>` placeholders to keep snapshots deterministic across worktree ports).

## Impact

- Editors get a clickable preview link automatically after every edit, no extra tool call
- Editors get live page URLs after publishing without navigating the tree
- No new tool surface area
- Establishes a pattern for "useful auxiliary data comes back in output by default, not behind a flag"
