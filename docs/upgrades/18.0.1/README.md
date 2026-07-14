# Upgrade: `@umbraco-cms/mcp-dev` 17.5.1 → 18.0.1 (Umbraco 17 → 18)

Date: 2026-07-14
Branch: `feature/upgrade-mcp-dev-18.0.1`

## Version changes

| Package | Old | New |
|---|---|---|
| `@umbraco-cms/mcp-dev` | `^17.5.1` | `^18.0.1` |
| `@umbraco-cms/mcp-hosted` | `^17.0.0-beta.28` | `^1.0.0-beta.31` (resolves beta.32) |
| `@umbraco-cms/mcp-server-sdk` | `^17.0.0-beta.28` | `^1.0.0-beta.31` (resolves beta.32) |
| `@modelcontextprotocol/sdk` (transitive) | 1.25.x | 1.29.0 (deduped, satisfies mcp-dev's `^1.28.0`) |
| demo-site `Umbraco.Cms` / `...DevelopmentMode.Backoffice` | `17.3.3` | `18.0.2` (latest stable on major 18) |
| demo-site `Umbraco.Workflow` | `17.1.1` | `18.0.1` |
| demo-site `Clean` starter kit | `7.0.5` | `8.0.1` (8.x tracks Umbraco 18) |

`target-framework` was already `net10.0` — no change. The chained binary is resolved from `node_modules`
(`src/config/mcp-servers.ts` via `findPackageJSON`), so `npm install` is the only switch — no version pin to edit
in `.mcp.json` or config.

## CMS tool surface diff (full, permission-complete: 372 → 419)

> ⚠️ An earlier pass under-counted this (372 → 373) because the snapshot used a hardcoded `allowedSections` list that
> excluded Umbraco 18's **new `Umb.Section.Library` section**, hiding the entire Elements family. The numbers below use
> a permission-complete user (all sections + all `Umb.Document.*` **and** new `Umb.Element.*` permissions) for both the
> 17.5.1 and 18.0.1 surfaces, so the diff is apples-to-apples.

**New (49):**

- **Elements domain — 46 tools (the headline feature).** Umbraco 18 introduces **Elements**: a first-class,
  document-like content entity with its own **Library** back-office section and a full `Umb.Element.*` permission set
  (Create/Read/Update/Delete/Publish/Unpublish/Move/Duplicate/Rollback). The tool set mirrors the Documents API almost
  1:1 — tree (`get-element-root`/`-children`/`-ancestors`/`-siblings`), CRUD (`create-element`, `update-element`,
  `update-element-properties`, `delete-element`), publishing (`publish-element`, `unpublish-element` — with workflow-approval
  awareness), move/copy, folders, a dedicated recycle bin, versions + rollback (`get-element-version`,
  `rollback-element-version`, `set-element-version-prevent-cleanup`), `search-element`, `validate-element`, and
  `get-element-configuration`. Elements support multiple cultures like documents.
- **3 type-schema helpers** — `get-data-type-schemas` (batch), `get-media-type-schema`, `get-member-type-schema`:
  "return the JSON Schema for a type by id", LLM plumbing to build correct create payloads.

**Removed (2):**
- `delete-user-current-avatar`
- `update-user-current-profile`

Neither removed tool is referenced by any `chainCms(...)` / `callTool("cms", ...)` caller in `src/`, so nothing broke.
`npm run compile` is clean — no typed-chaining breakages from renamed tools or changed input/output shapes.

## Triage

**Elements (46 tools) — a genuine new editor-facing domain, warrants editor tools.** "Library" is a real section in the
v18 back-office nav (confirmed visually), and Elements mirror Documents, which our `content` collection already wraps.
Wrapping them means a new collection that parallels `content` — `create-element` (↔ `create-page`),
`update-element-properties` (↔ `edit-page`/`update-document-properties`), `publish-element`/`unpublish-element`,
move/delete/duplicate, tree listing, `search-element`, versions/rollback, folders. This is substantial (≈12–15 editor
tools + integration tests + eval coverage) and, per the editor-MCP design rule, needs the **Library back-office flow
traced first** (blocked in this session — see below). **Scoped as follow-up work, not folded into the version bump.**

**3 type-schema helpers — not wrapped.** Developer/LLM plumbing with no back-office user action (an editor sees a
rendered form, never "fetches a JSON schema"). Optional future *internal* use: `get-data-type-schemas` (batch) in
`content/get/get-property-value-template.ts`; `get-media-type-schema`/`get-member-type-schema` to harden
`create-media`/`create-member` payload construction.

## Real breakage found & fixed: the `umbraco-swagger` client's redirect path moved

`scripts/create-api-user.mjs` bootstraps an admin bearer token via a PKCE flow against the **`umbraco-swagger`**
OAuth client (a public client that returns real tokens in the response body). Umbraco 18 moved the bundled API docs
from `/umbraco/swagger/` to `/umbraco/openapi/`, so that client's registered redirect changed and the old value
returned `invalid_request` / `ID2043` ("redirect_uri is not valid for this client application"):

- `redirect_uri`: `…/umbraco/swagger/oauth2-redirect.html` → `…/umbraco/openapi/oauth2-redirect.html`

Confirmed against `umbracoOpenIddictApplications` in the running v18 DB:

| ClientId | RedirectUris |
|---|---|
| `umbraco-swagger` | `…/umbraco/openapi/oauth2-redirect.html` |
| `umbraco-back-office` | `…/umbraco/oauth_complete` |
| `umbraco-postman` | `https://oauth.pstmn.io/v1/callback`, … |
| `umbraco-editor-mcp-hosted` | `http://localhost:8787/callback`, … |

**Do NOT switch to the `umbraco-back-office` SPA client** (an easy wrong turn): its `HideBackOfficeTokensHandler`
replaces the authorization code / tokens with the literal string `"[redacted]"` and moves the real values into
httpOnly cookies, so a server-side PKCE exchange gets `invalid_request` / "code missing" (ID2029). The `umbraco-swagger`
client has no such handler. With the redirect-path fix, `create-api-user.mjs` completes end-to-end and creates the
`umbraco-back-office-mcp` API user (verified locally against v18: "API user created and verified successfully").

> Note: the `code=[redacted]` seen while experimenting with the `umbraco-back-office` client was **Umbraco's own
> token-hiding handler**, not a sandbox/network scrub — the `umbraco-swagger` client returns a real, usable `code`.

## Tooling limitation worth recording: Claude for Chrome can't drive the authenticated back office

Separate from the fix above: the Claude-for-Chrome automation layer **503s any request carrying an
`Authorization: Bearer …` header** (verified: `Bearer` → 503, `Basic` → 401, no-header → 401). The whole Management
API is Bearer-authed, so authenticated fetches fail; the back-office `umbHttpClient` retries the 503 and appears to
hang, and tree/collection panels render empty. Navigation-based login still works (not a Bearer fetch). So Claude for
Chrome is fine for static/visual inspection and login, but **the Elements/Library flow must be traced with Playwright**
(its own Chromium, no Bearer interception) in the follow-up. This does not affect the Node test runner or the MCP
chain (client-credentials), so the integration suite runs normally.

## Testing

With the `create-api-user.mjs` fix, the API user is created normally and the integration suite (`npm test`) runs
locally against the upgraded v18 demo-site. First run: **482 passed, 5 failed**; all 5 triaged and fixed, then green.
Eval tests (`npm run test:evals`) are LLM-driven and validated on CI.

### The 5 failures and their fixes

1. **`member-reporting/report-member-count` + `report-members-by-group`** — *real v18 response-shape change.* The member
   **search/collection** endpoint (`find-member` → `/filter/member`) now returns `groups: []` on every item; group
   membership is only populated on the per-member **detail** GET. Both reports filtered members client-side with
   `m.groups.includes(groupId)`, which now drops everything. Fix: rely on the server-side `memberGroupName` filter
   (verified to filter server-side) instead of the empty `groups` field — `report-members-by-group` returns the
   filtered results directly; `report-member-count` derives each group's count from a per-group filtered query total.
2. **`blueprint/create-blueprint` + `get-blueprint`** — *snapshot drift.* Both snapshot a blueprint built from the first
   root page, whose document type is provided by the **Clean starter kit**; Clean 8.0.1 changed that type (added
   `isIndexable` / `isFollowable`, reordered). Regenerated the 2 snapshots (local and CI both run Clean 8.0.1, so they
   stay deterministic).
3. **`content/get-property-value-template`** — *minor output drift.* v18's `get-data-type-schema` no longer echoes the
   editor alias string in its payload, so the tool's `message` (raw schema JSON) lost the `"Umbraco.MediaPicker3"`
   substring a test asserted. Fix: the tool now prefixes the message with `Value-shape template for <editorAlias>:`
   (clearer for the LLM regardless).

> Note the pre-existing fragility surfaced by (1)/(2): both suites read pre-existing/Clean-provided data rather than
> building fully self-owned fixtures (contra `CLAUDE.md`). Left as-is for this upgrade; worth hardening later.
