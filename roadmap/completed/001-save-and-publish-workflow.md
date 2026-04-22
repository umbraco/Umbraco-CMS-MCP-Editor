# Save and Publish Workflow

> **Status:** ✅ Completed — shipped as the `save-and-publish` tool in the `publishing` collection (PR #10).

## Problem

In the Umbraco backoffice UI, the primary action button is **"Save and publish"** which performs a single atomic operation: save content changes, validate, then publish. There are also separate **"Save"** (draft only) and **"Publish"** buttons.

Our MCP tools split this into two separate operations:
- `edit-page` — saves property changes (draft only, not published)
- `publish-page` — publishes the page (but does NOT save pending changes first)

This means an LLM must always call `edit-page` then `publish-page` as two sequential steps to achieve what the UI does in one click. This is error-prone because:
1. The LLM might forget to publish after editing
2. The LLM might try to publish without saving first
3. Two confirmation prompts are shown instead of one
4. If publish fails after save, the content is in a draft state the user didn't intend

## UI Workflow (Reproduction Steps)

1. Navigate to Content > select any page (e.g. Home)
2. Edit a property value (e.g. change Title)
3. Click **"Save and publish"** (green button, bottom right)
4. Umbraco saves the changes, validates, and publishes in one operation
5. A single success notification appears

Additional footer actions available:
- **Save** — save as draft only
- **Save and preview** — save and open preview
- **Schedule publish** — save and set a future publish date
- **Publish with descendants** — publish this page and all children
- **Unpublish** — take the page offline

## Proposed Tool: `save-and-publish`

A combined tool that mirrors the UI's primary action.

**Input:**
- `id` (uuid) — page ID
- `values` (array, optional) — property values to update (same format as edit-page)
- `includeDescendants` (boolean, optional) — also publish child pages

**Behaviour:**
1. If `values` provided, save the property changes first (delegate to `update-document-properties`)
2. Validate (check for validation errors)
3. Publish the page (delegate to `publish-document`)
4. Return combined result with save + publish status
5. Single confirmation prompt: "Save and publish 'Page Name' with X field changes?"

**Why this matters:**
- Matches the mental model of every Umbraco editor
- Reduces tool calls from 2 to 1 for the most common editorial workflow
- Single confirmation instead of two
- Atomic operation — either everything succeeds or the user gets a clear error
- The LLM can say "I'll save and publish your changes" instead of "I'll save your changes, then publish"

## Impact

High — this is the single most common editorial action in Umbraco.
