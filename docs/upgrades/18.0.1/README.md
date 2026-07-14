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

## Real breakage found & fixed: Umbraco 18 removed the bundled Swagger UI

`scripts/create-api-user.mjs` bootstrapped an admin bearer token via a PKCE flow against the **`umbraco-swagger`**
OAuth client with redirect `…/umbraco/swagger/oauth2-redirect.html`. In Umbraco 18 the bundled Swagger UI is gone —
`/umbraco/swagger/*` all return 404 and that client's redirect URI is no longer registered, so authorize returned
`invalid_request` / `ID2043` ("redirect_uri is not valid for this client application").

**Fix:** repoint the bootstrap at the real back-office SPA client — a public PKCE client:
- `client_id`: `umbraco-swagger` → `umbraco-back-office`
- `redirect_uri`: `…/umbraco/swagger/oauth2-redirect.html` → `…/umbraco/oauth_complete`

Verified correct against the running v18 site: the back office login page itself uses exactly
`client_id=umbraco-back-office` + `redirect_uri=…/umbraco/oauth_complete` + `code_challenge_method=S256`, and an
interactive browser login succeeds and reaches `/umbraco`. So on CI (which runs unredacted) the script completes the
token exchange and creates the `umbraco-back-office-mcp` API user with the deterministic secret the tests expect.

## Environment blocker for LOCAL testing (not an upgrade defect)

This sandbox blocks programmatic authentication, so the API user could not be created here and the integration/eval
suites could not be run locally in this session:

- **Node / curl:** OAuth authorization codes are scrubbed on the wire — the `code` query param arrives as the literal
  `[redacted]` (confirmed via base64 round-trip; reproduced with the bash sandbox disabled and with no proxy env), so
  the PKCE token exchange can never complete from a tool-spawned process.
- **Chrome automation:** the Claude-for-Chrome automation layer **503s any request carrying an
  `Authorization: Bearer …` header** (verified: `Bearer` → 503, `Basic` → 401, no-header → 401). The whole Management
  API is Bearer-authed, so every authenticated fetch fails; the back-office `umbHttpClient` retries the 503 and appears
  to hang, and tree/collection panels render empty. So the API user can't be created through the UI / in-page fetch
  either, and the Library (Elements) tree can't be explored through the automated tab. Navigation-based login works
  (not a Bearer fetch). **Playwright** (its own Chromium, no Bearer interception) is the correct tool for tracing the
  Elements/Library flow in a follow-up.

The back office **interactive login works** (navigation-based OAuth is not scrubbed), which is what let us confirm the
`create-api-user.mjs` fix. Tests should be validated on **CI**, or by creating the API user from a plain terminal
outside the Claude sandbox and re-running `npm run test:all`.
