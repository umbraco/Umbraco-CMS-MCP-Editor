# Set Page Template

## The Friction

When a document type allows multiple templates (e.g. a Landing Page with both `landing-default` and `landing-wide`), editors switch templates from the **Info** tab of the workspace:

1. Open the page
2. Click the Info tab
3. Pick a template from the dropdown
4. Save

Today this server has **no** tool for that. `edit-page` calls chained `update-document-properties`, which only edits property values — it ignores the page-level `template` field. So an LLM helping an editor cannot say "switch this page to the wide layout".

## Underlying API surface

The chained CMS dev MCP already exposes everything needed:

- `get-document` returns `template: { id } | null` (current template)
- `get-document-type` returns `allowedTemplates[]` and `defaultTemplate` (what the editor is allowed to pick)
- `update-document` accepts `template: { id } | null` on the body
- `get-template` resolves a template ID to its `name` / `alias` for friendly output

## Proposed Tool: `set-page-template`

**Input:**
- `pageId` (uuid) — required
- `templateId` (uuid \| null) — required; pass `null` to clear back to the default

**Behaviour:**
1. Fetch the page → resolve current template id + doc type id
2. Fetch the doc type → list `allowedTemplates` (flag the `defaultTemplate`)
3. Reject early with a structured error if `templateId` isn't in `allowedTemplates`, listing the allowed options so the LLM can re-prompt
4. Resolve old + new template names via `get-template` for the confirm prompt
5. `confirmAction(...)` — destructive-ish (changes rendered output): `Switch template on '<page name>' from '<old>' to '<new>'?`
6. Call chained `update-document` with the same `values` / `variants` already on the page plus the new `template` (the dev MCP requires the full body)
7. Return `{ pageId, oldTemplate: { id, name } | null, newTemplate: { id, name } | null }` plus a fresh `get-publish-status` snapshot so the LLM can verify (per the recent "post-action state verification" pattern)

**Slices:** `update`
**Annotations:** `destructiveHint: false`, `idempotentHint: true` (setting the same template twice is a no-op)

## Companion read tool: `list-page-templates`

Without this, the LLM has to chain `get-page` → `get-document-type` → `get-template` × N just to know what the options are. Better to expose:

**Input:** `pageId` (uuid)

**Output:**
```ts
{
  pageId: string;
  current: { id, name, alias } | null;
  default: { id, name, alias } | null;
  allowed: { id, name, alias, isDefault: boolean, isCurrent: boolean }[];
}
```

This is the natural pre-flight call before `set-page-template` and a useful answer on its own ("which templates can this page use?").

## Collection placement

`content/` — sits next to `edit-page`, `get-page`, `rename-page`. Both new tools belong in the `content` mode.

## Out of scope

- **Creating / editing / deleting templates themselves** — those are settings/dev work, not editorial. The CMS dev MCP has `create-template` / `update-template` / `delete-template`; we deliberately do not surface them (matches the "Editor MCP scope boundaries" memory: site-infrastructure config is too dangerous for editors/agents).
- **Changing `allowedTemplates` on a doc type** — same reason; that's a doc-type-level change.

## Acceptance

- [ ] `list-page-templates` (read-only) implemented
- [ ] `set-page-template` (write) implemented with `confirmAction` and post-action verification
- [ ] Both tools registered in the `content` collection and the `content` mode
- [ ] Integration tests:
  - Create a doc type with two allowed templates, create a page, switch the template, verify
  - Reject an unknown template id with the allowed list in the error
  - Pass `null` to clear the template back to default
- [ ] Eval coverage added to `tests/evals` (chained natural-language scenario: "use the wide layout on the homepage")
- [ ] `npm run test:all` passes
