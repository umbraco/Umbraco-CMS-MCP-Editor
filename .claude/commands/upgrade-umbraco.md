---
description: Upgrade the chained @umbraco-cms/mcp-dev server (and the demo-site Umbraco it drives) to the latest release, surface newly-available CMS tools, learn each new capability's back office user flow (via Claude for Chrome or Playwright), and wrap it as an editor tool that mirrors that flow.
argument-hint: "[mcp-dev version, e.g. 18.0.1 — omit for latest]"
---

# /upgrade-umbraco

Upgrade the **chained Umbraco CMS Developer MCP** (`@umbraco-cms/mcp-dev`) — and the demo-site Umbraco packages it talks to — to the latest release, diff the CMS tool surface to find newly-available tools, fix any typed-chaining breakages, run the tests, and wrap meaningful new capabilities as editor tools.

**The aim of the editor MCP is to replicate, as tools, how the Umbraco back office UI behaves for a human editor.** A raw CMS tool exposes an API operation; an editor tool should reproduce the *user flow* — the same steps, defaults, validation, confirmations, and end state a user experiences in the back office. So the design of each new editor tool comes from observing the back office, **not** from the CMS tool's signature. This command builds that in: after finding new/changed CMS tools, drive the running demo site (with Claude for Chrome or Playwright) to learn the real UI flow, then model the editor tool on it.

Unlike the Developer MCP, **this server never connects to the Umbraco Management API directly**. Every tool delegates to `@umbraco-cms/mcp-dev` via MCP chaining (`AI Client → Editor MCP → CMS Dev MCP → Umbraco API`). So there is **no Orval / OpenAPI regeneration step here**. The "API surface" that matters to us is the *typed CMS tool registry* (`CmsTools` / `CmsToolsName` from `@umbraco-cms/mcp-dev/tool-types`) plus the runtime `collections` export. An upgrade means: bump the chained package, align the demo-site CMS version, adapt to the tools that appear/disappear/change shape, and — for genuinely new capabilities — replicate the back office flow they correspond to.

## Usage

```
/upgrade-umbraco                   # upgrade @umbraco-cms/mcp-dev to latest stable
/upgrade-umbraco 18.0.1            # upgrade to a specific @umbraco-cms/mcp-dev version
```

ARGUMENTS: $ARGUMENTS

## Prerequisites

- A database for the demo-site. Simplest is **SQLite** (`bootstrap-demo-site.sh --sqlite`) — no server, ships inside `Umbraco.Cms`, ideal for a plain dotnet box. SQL Server is the CI/worktree default (reachable from `demo-site/appsettings.local.json`, or a worktree DB — see below).
- A working `.env` with `UMBRACO_CLIENT_ID`, `UMBRACO_CLIENT_SECRET`, `UMBRACO_BASE_URL`.
- `dotnet`, `npm`, `node`, `curl`, `python3` on PATH.
- **A way to drive the back office** for the flow-discovery step (step 9), either:
  - **Claude for Chrome** — good for **visual/static inspection and navigation-based login only**. Point it at `<UMBRACO_BASE_URL>/umbraco` and log in as `admin@admin.com` / `1234567890` — the login *works* because it's a top-level OAuth navigation, not a `fetch`. **⚠️ It CANNOT drive authenticated data operations.** The Claude-for-Chrome automation layer refuses to forward any request carrying an `Authorization: Bearer …` header (it returns **503**; `Basic` and no-auth pass through as normal 401/200). The entire Umbraco Management API is Bearer-authenticated, so every data call from the automated tab 503s — the back-office client retries the 503 and *appears to hang* (`umbHttpClient.get` never resolves, and the tree/collection panels render empty). Net effect: you can log in and screenshot chrome, but you cannot load a tree, open a node, or create/edit/publish through it. **Use it only to confirm a section exists and eyeball static layout; use Playwright for anything that needs data to load or mutate.** (Verified on the Umbraco 18 upgrade: `Bearer` → 503, `Basic` → 401.)
  - **Playwright** — the reliable option for tracing an actual authenticated flow, because it drives its own Chromium (NOT through the Claude-for-Chrome extension), so it has no Bearer-blocking interception. Chromium is pre-installed (`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`; don't run `playwright install`) and this repo already uses `@playwright/test` (see `playwright.config.ts` / `tests/hosted-e2e`). The back office is HTTPS with a self-signed cert, so launch with `ignoreHTTPSErrors: true`. If even Playwright can't complete login in a locked-down sandbox (some environments also scrub the OAuth authorization `code` on the wire — see the create-api-user note in step 7), trace the flow against a back office running outside the sandbox, or read the flow from the CMS tool `input`/`output` shapes plus the Umbraco 18 back-office source, and say in the report that the flow wasn't driven live.
- Use a **new, empty database** for the upgraded demo-site — don't reuse the previous version's DB. Development config has `InstallUnattended: true` (admin `admin@admin.com` / `1234567890`), so a fresh DB auto-installs on first boot, and `scripts/create-api-user.mjs` then recreates the API user + `umbraco-back-office-mcp` OAuth client. Nothing needs to be carried over.

## Key architecture facts (why this differs from the Dev MCP's `/upgrade-umbraco`)

- **The chained binary is resolved from `node_modules`.** `src/config/mcp-servers.ts` locates `@umbraco-cms/mcp-dev` via `findPackageJSON` and spawns its `bin` with the current Node. So once `npm install` pulls the new version, the stdio chain automatically uses it — there is no version string to edit anywhere else.
- **Types come from the same package.** `src/umbraco-api/cms-chain.ts` is generic over `CmsToolsName`/`CmsTools` from `@umbraco-cms/mcp-dev/tool-types`. `npm run compile` is the primary breakage detector: renamed/removed CMS tools and changed input/output shapes surface as type errors at every `chainCms(...)` call site.
- **Two runtimes consume the CMS server.** Stdio mode spawns it as a subprocess (`mcp-servers.ts`); the hosted worker runs it in-process by importing `@umbraco-cms/mcp-dev/collections` (`src/worker.ts`, `src/testing/in-process-cms.ts`). Both must keep working after the bump.
- **SDK singleton alignment matters.** `@umbraco-cms/mcp-server-sdk` and `@umbraco-cms/mcp-hosted` must be compatible with the versions the new `@umbraco-cms/mcp-dev` depends on — in-process chaining relies on hitting the same SDK singleton. Match our ranges to whatever the target `mcp-dev` declares.

## Steps

### 1. Set up an isolated worktree

Use `EnterWorktree` to create a worktree for `feature/upgrade-mcp-dev-<version>`. The hooks copy `.env` + `demo-site`, provision a fresh SQL Server DB, rewrite `appsettings.local.json` / `launchSettings.json` for a dynamic port, and run `npm install`. Then confirm a clean baseline before changing anything:

```bash
npm install
npm run compile        # baseline must be green before you touch versions
```

### 2. Identify the target versions

If no argument is given, query npm for the latest non-prerelease `@umbraco-cms/mcp-dev`:

```bash
npm view @umbraco-cms/mcp-dev version           # latest stable
npm view @umbraco-cms/mcp-dev versions --json    # full history if you need a specific one
```

Then discover the peer versions and target CMS version that release expects:

```bash
# SDK + hosted ranges the target mcp-dev depends on — match ours to these.
npm view @umbraco-cms/mcp-dev@<version> dependencies --json
```

- Set this repo's `@umbraco-cms/mcp-server-sdk` and `@umbraco-cms/mcp-hosted` to satisfy the ranges the target `mcp-dev` declares (these three move together — a mismatch breaks the in-process SDK singleton).
- The `mcp-dev` **major tracks the Umbraco major** (17.x → Umbraco 17, 18.x → Umbraco 18). Confirm the CMS version the release was built against from the Dev MCP repo's own demo-site template at the matching tag: `umbraco/Umbraco-CMS-MCP-Dev` → `demo-site-template/demo-site-template.csproj`. Take the latest stable CMS release on that major from NuGet:

```bash
curl -s "https://api.nuget.org/v3-flatcontainer/umbraco.cms/index.json" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); \
      print(next(v for v in reversed(d['versions']) \
      if v.startswith('<CMS_MAJOR>.') and not any(x in v for x in ['rc','beta','alpha','pre'])))"
```

Also note the matching `Umbraco.Cms.DevelopmentMode.Backoffice` (same version as `Umbraco.Cms`) and check `Umbraco.Workflow` for a compatible release on the new major.

### 3. Capture the CMS tool surface *before* upgrading

The whole point of this command is to see what tools the upgrade adds/removes — so this capture **must not miss any tool**. Tool visibility is permission-gated (a caller only sees tools their `allowedSections` + `fallbackPermissions` allow), which means **a hardcoded permission list silently hides every tool behind a section or permission family that a new Umbraco major introduces.** That is exactly how the Umbraco 18 **Elements** domain — a new `Umb.Section.Library` section + `Umb.Element.*` permissions, **46 tools** — got missed on a first pass and nearly shipped unnoticed. **Never hardcode the permission scope.**

Use `scripts/capture-cms-tool-surface.mjs`, which derives a permission-COMPLETE user from the installed package's own dist (every `Umb.Section.*` and every `Umb.<Entity>.<Permission>` it references), so nothing is filtered regardless of what a new major adds. It also records the section + permission-family lists so step 5 can flag new ones.

```bash
npm run build   # ensure @umbraco-cms/mcp-dev is installed & importable
node scripts/capture-cms-tool-surface.mjs /tmp/cms-surface-old
# -> /tmp/cms-surface-old.tools.txt / .sections.txt / .permfamilies.txt (stderr prints the counts)
```

Eyeball the stderr counts and the section list — if the tool count looks suspiciously close to a previous run's *scoped* count, or a section you expected is absent, stop and investigate before bumping. A silent under-count here poisons the entire diff.

### 4. Bump the package versions

Edit `package.json`:

```jsonc
"@umbraco-cms/mcp-dev": "^<version>",
"@umbraco-cms/mcp-hosted": "<range matching target mcp-dev>",
"@umbraco-cms/mcp-server-sdk": "<range matching target mcp-dev>",
```

Edit `demo-site-template/demo-site-template.csproj` (the demo-site the tests run against; `demo-site/` is gitignored and rebuilt from this template):

```xml
<PackageReference Include="Umbraco.Cms" Version="X.Y.Z" />
<PackageReference Include="Umbraco.Cms.DevelopmentMode.Backoffice" Version="X.Y.Z" />
<PackageReference Include="Umbraco.Workflow" Version="A.B.C" />
```

Reinstall and rebuild:

```bash
npm install
npm run build
```

### 5. Diff the CMS tool surface

Capture the new surface with the **same script** (now resolving the upgraded package), then diff tools, sections, and permission families:

```bash
node scripts/capture-cms-tool-surface.mjs /tmp/cms-surface-new

echo "=== NEW sections (a new section usually means a whole new domain — investigate first) ==="
comm -13 /tmp/cms-surface-old.sections.txt /tmp/cms-surface-new.sections.txt
echo "=== NEW permission families (e.g. Umb.Element = the Elements domain) ==="
comm -13 /tmp/cms-surface-old.permfamilies.txt /tmp/cms-surface-new.permfamilies.txt

echo "=== NEW CMS tools (candidates to wrap) ==="
comm -13 /tmp/cms-surface-old.tools.txt /tmp/cms-surface-new.tools.txt
echo "=== REMOVED CMS tools (must fix any chainCms callers) ==="
comm -23 /tmp/cms-surface-old.tools.txt /tmp/cms-surface-new.tools.txt
```

**Read the section/permission-family diff first.** A new `Umb.Section.*` or `Umb.<Entity>.*` family is the loudest possible signal that the major added a whole new editor-facing domain (a batch of related tools that share a tree/CRUD/publish shape), not just a scattering of endpoints. Group the new tool list by that signal — e.g. all `*-element*` tools belong to the new Elements domain — so step 9's flow-discovery and step 10's wrapping treat the domain as one coherent piece (usually a new collection mirroring an existing one like `content`), rather than triaging 40+ tools individually and losing the forest for the trees. A large new domain is often its own follow-up effort — size it explicitly and say so in the report rather than half-wrapping it.

Cross-check removals/renames against our own call sites:

```bash
# Every CMS tool name we chain to — none of these may disappear silently.
grep -rhoE 'chainCms\(\s*"[^"]+"' src | sort -u
grep -rn 'callTool\(\s*"cms"' src
```

### 6. Fix typed-chaining breakages

```bash
npm run compile
```

Because `chainCms<TName>` is generic over `CmsToolsName`, compile errors pinpoint every place a CMS tool was renamed/removed or had its `input`/`output` shape change. Also check the direct type imports:

- `src/umbraco-api/cms-chain.ts` — `CmsTools`, `CmsToolsName`
- `src/umbraco-api/tools/helpers/validate-document.ts` — `GetDocumentByIdOutput` (and any other `@umbraco-cms/mcp-dev/tool-types` imports; `grep -rn "mcp-dev/tool-types" src`)

For a renamed tool, update the `chainCms("<old>")` name and adjust the args/response mapping. For a removed tool with no replacement, that's a real regression in the wrapping editor tool — fix or retire the editor tool and call it out in the PR.

### 7. Boot the upgraded demo-site

```bash
npm run stop:umbraco                                   # stop anything still running
# Rebuild demo-site/ from the upgraded template. Pick a DB:
#   --sqlite : server-less SQLite (no SQL Server / Docker) — ideal for a plain
#              dotnet box; writes a SQLite appsettings.local.json for you.
bash scripts/bootstrap-demo-site.sh --force --sqlite
#   (SQL Server path instead: omit --sqlite and point
#    demo-site/appsettings.local.json at a NEW, empty DB — the worktree hook
#    provisions one automatically.)
npm run start:umbraco                                  # NuGet restore, build, unattended install
```

Either way, use a **fresh** database for the upgraded site — with `--sqlite` that means starting from no `Umbraco.sqlite.db` (a `--force` bootstrap into a clean worktree gives you that, since `umbraco/Data/` is excluded from the copy).

`start:umbraco` writes the bound port to `.demo-site-port` and updates `UMBRACO_BASE_URL` in `.env`. In a worktree, `start:umbraco` (and the worktree hook) already run `scripts/create-api-user.mjs` for you against the fresh DB, so the API user + `umbraco-back-office-mcp` OAuth client normally exist by the time boot finishes. If you recycled the DB by hand, run it explicitly against the running instance's URL (idempotent — logs "API user already exists — skipping creation" if present):

```bash
node scripts/create-api-user.mjs "$UMBRACO_BASE_URL" admin@admin.com 1234567890
```

Because the DB is new, expect a clean unattended install in the boot log (not forward migrations).

**`create-api-user.mjs` bootstraps an admin token via a PKCE flow — a major bump can break it.** The script logs in as admin, then runs `authorize` → `token` against an OAuth client to get a bearer token it uses to create the API user. Two things to watch:

- **The client/redirect it uses must still exist.** Umbraco 18 **removed the bundled Swagger UI**, so the old `umbraco-swagger` client + `/umbraco/swagger/oauth2-redirect.html` redirect are gone (`authorize` → `invalid_request` / `ID2043`). The script now uses the real back-office SPA client — `client_id=umbraco-back-office`, `redirect_uri=<baseUrl>/umbraco/oauth_complete`. Confirm against the running site: open `<baseUrl>/umbraco`, watch the login URL — the `client_id` and `redirect_uri` it uses are the ones the script must use. If a future major changes them again, update the constants in `scripts/create-api-user.mjs`.
- **Some sandboxes scrub the OAuth authorization `code` on the wire.** If the script logs "No redirect from authorize endpoint" or "code missing" even though the client/redirect are correct, the environment is redacting the `code` query param in the `authorize` redirect (the value arrives as literal `[redacted]`), so the token exchange can never complete from a spawned process. This blocks programmatic API-user creation in that sandbox. Work around it by running `create-api-user.mjs` from a terminal **outside** the sandbox (or let CI create it), then run the tests. (An interactive browser login still works, because navigation-based OAuth isn't scrubbed — but see the Claude-for-Chrome Bearer caveat in Prerequisites: you still can't drive authenticated data ops through the automated tab.)

### 8. Run the tests

```bash
npm run test:all       # integration + eval suites (build is included)
```

Triage failures into three buckets (same as the Dev MCP command, but the "contract" is the chained CMS tool, not a REST endpoint):

1. **Snapshot / response-shape drift** — the CMS tool now returns additive fields, new enum values, or reworded messages, so an editor tool's LLM-optimised output changed. Review the diff; if it's genuinely additive, update the snapshot (the user accepts snapshot diffs — don't blanket `-u`).
2. **Type-level breakages from new optional params** — pass the field explicitly (`field: undefined`) matching the pattern used for other optionals in the same file.
3. **Real regressions** — an editor tool no longer matches the CMS tool's contract (renamed field consumed in a mapping, changed required input, removed tool). Fix the wrapping tool.

Always run tests locally and get them green before pushing — CI runs against a fresh Umbraco install, so tests must build their own data (never snapshot pre-existing content).

### 9. Triage the new/changed tools, then learn each keeper's back office flow

First, decide which of the "NEW" tools from step 5 are worth an editor tool:

- Is it already covered by an existing editor tool? (Editor tools are deliberately higher-level than the raw CMS tools — one editor tool may compose several.)
- Does it correspond to something a human actually **does in the back office**? The editor MCP replicates back office behaviour, so a capability with no user-facing counterpart (pure plumbing, internal batch endpoints) usually isn't a good editor tool — note it and move on.
- Also revisit **changed** tools whose shape drifted in step 6/8: if the back office flow they back has changed, the corresponding editor tool's flow may need to change too, not just its types.

For each capability you're keeping, **drive the back office on the running demo site to learn the real user flow before designing the tool.** Reproducing the flow — not the API — is the whole point.

The back office is at `<UMBRACO_BASE_URL>/umbraco` (the port is in `.demo-site-port`); log in as `admin@admin.com` / `1234567890`. Explore it with **Claude for Chrome** (drive a real browser conversationally — best for open-ended investigation) or **Playwright** (scripted, headless, for a repeatable trace you can commit) — see Prerequisites. Trace and write down, for each capability:

- **Entry point & context** — where in the tree/section the action starts, what must be selected first (a document, a media item, a data type…).
- **Inputs the user provides** — the fields, their types, which are required, sensible defaults the UI pre-fills, and any pickers/validation the UI enforces. These become the tool's Zod input schema — mirror the UI's required/optional split and defaults.
- **Confirmations & warnings** — modals the UI shows before destructive or wide-reaching actions (delete, unpublish, move). These map to `confirmAction(...)` prompts, with the same wording/intent the user sees.
- **Sequencing** — if the UI makes the user do A then B (e.g. save before publish), the editor tool should either compose those steps or enforce the same order.
- **End state & feedback** — what success looks like in the UI (the toast/notification text, the resulting state). The tool's output should convey the same outcome in LLM-friendly terms.

Capture the trace notes (and a screenshot or two of the key screens) under the upgrade worktree — e.g. `docs/upgrades/<version>/<capability>.md` — so the tool design and the PR can point back to the observed flow. Compare the flow against the CMS tool's `input`/`output` (from `CmsTools[...]`) to confirm the chained tool actually supports every step the UI performs; if the UI does something no single CMS tool covers, the editor tool composes several `chainCms` calls (this is expected and normal).

### 10. Wrap the new capability as an editor tool that mirrors the flow

Model the tool on the flow you observed in step 9, following this repo's conventions (see `CLAUDE.md` → *Tool Conventions*):

- One file per tool under `src/umbraco-api/tools/<collection>/{get,post,put,delete}/`, registered in the collection's `index.ts`.
- Delegate via `chainCms("<cms-tool-name>", args)` from `src/umbraco-api/cms-chain.ts` — typed end-to-end. Prefer this over raw `mcpClientManager.callTool`. Compose multiple `chainCms` calls when the UI flow spans several operations.
- Shape the Zod **input schema to the UI's fields** (required/optional and defaults matching what the back office pre-fills), not to the raw CMS tool's parameter list. Use `z.string().uuid()` for LLM input IDs and `z.guid()` for GUIDs Umbraco returns (version IDs especially — see `versioning/post/rollback-page.ts`).
- Export `withStandardDecorators(tool)`. Use `confirmAction(...)` wherever the back office shows a confirmation, echoing the same intent. Set `slices`, `annotations`, and register the collection in a mode (`config/mode-registry.ts`) / slices in `config/slice-registry.ts` as needed.
- Shape the **output to mirror the UI's end state / feedback** so the LLM gets the same signal a user would.
- Add an integration test under the collection's `__tests__/` that creates its own data, uses `setupTestEnvironment()` + `setupEditorElicitation` for writes, and calls tools via `callTool(...)` (runs the outputSchema, matching the wire). Snapshot only self-created data. Where practical, assert the tool reaches the same end state the UI flow produced.
- **Add the new tool name to the `allTools` array in every eval file** under `tests/evals/` (each eval file maintains its own list). Consider an eval whose prompt frames the task the way a back office user would phrase it.

Then live-validate each new tool through the running `.mcp.json` with the **`audit-tool` skill** — this closes the gap between "integration tests pass" and "the live chained MCP works" (`-32602` schema mismatches only show on the wire), and lets you confirm the tool's behaviour matches the back office flow end-to-end.

### 11. Report and hand off

Summarise:

- Old → new `@umbraco-cms/mcp-dev` (and sdk/hosted) versions, and old → new demo-site Umbraco version.
- **New CMS tools** (with the editor tool names you added to wrap them, the back office flow each mirrors, or a note on why one was skipped — e.g. no user-facing counterpart).
- **Removed/renamed CMS tools** (must always be addressed — every `chainCms` caller depending on them fails).
- Modified response shapes worth flagging (deprecated/additive fields) and the tests whose snapshots drifted for the user to review.
- Links to the flow-trace notes/screenshots captured in step 9 (`docs/upgrades/<version>/`).

Only open a PR when the user asks. If they do, push the branch and follow the repo's PR/CI workflow (`CLAUDE.md`): poll checks, read failing logs, fix, and loop until green before reporting the PR ready.

### 12. Refresh your primary checkout (after merge)

The upgrade happened in the worktree; your main checkout's `demo-site/` still runs the old version (`start:umbraco` skips re-bootstrapping when `demo-site/` exists). After the PR merges and you pull:

```bash
npm run stop:umbraco
bash scripts/bootstrap-demo-site.sh --force --sqlite   # recopy upgraded template + server-less SQLite DB
# (SQL Server instead: omit --sqlite and point appsettings.local.json at a NEW, empty DB.)
npm run start:umbraco
node scripts/create-api-user.mjs                        # recreate API user + umbraco-back-office-mcp client
```

Confirm the running version: `grep 'Umbraco.Cms"' demo-site/demo-site.csproj` and watch the boot log for the port coming up.

## Common pitfalls

- **Claude for Chrome can't drive the authenticated back office here.** Its automation layer 503s any request carrying an `Authorization: Bearer …` header, and the whole Management API is Bearer-authed, so trees/lists never load and write flows hang (the client retries the 503). Login works (it's a navigation, not a fetch). Use it for static/visual checks; use **Playwright** to trace any flow that needs data to load or mutate. Don't burn cycles re-trying authenticated `fetch`/`umbHttpClient` calls in the automated tab — they will 503-hang every time. (See Prerequisites for the full write-up.)
- **Never hardcode the permission scope when snapshotting the tool surface.** Tool visibility is gated by `allowedSections` + `fallbackPermissions`, so a fixed list silently drops every tool behind a section or permission family a new major adds — this is precisely how the Umbraco 18 Elements domain (new `Umb.Section.Library` + `Umb.Element.*`, 46 tools) was missed. Always capture with `scripts/capture-cms-tool-surface.mjs` (derives the complete scope from the installed package), and read the **new-sections / new-permission-families** diff in step 5 before the tool diff — a new section is the loudest signal of a new domain.
- **Design to the back office flow, not the CMS tool signature.** The editor MCP replicates what a user does in the UI. A new editor tool's inputs, confirmations, sequencing, and output should mirror the observed flow (step 9); a one-to-one passthrough of a raw CMS tool is usually the wrong shape. If a capability has no back office counterpart, it probably shouldn't become an editor tool.
- **No management-API regeneration here.** There is no `npm run generate`/Orval step — the CMS contract arrives entirely through `@umbraco-cms/mcp-dev`. If you catch yourself editing an OpenAPI client, you're in the wrong repo (that's the Dev MCP).
- **Keep the three `@umbraco-cms/*` packages in lockstep.** `mcp-dev`, `mcp-server-sdk`, and `mcp-hosted` must be mutually compatible; a mismatch breaks in-process chaining (worker + tests) even when stdio still works. Match ranges to what the target `mcp-dev` declares.
- **The chained binary follows `node_modules`.** Don't look for a version pin in `.mcp.json` or config — `mcp-servers.ts` resolves the installed package. `npm install` is the switch.
- **Verify both runtimes.** Stdio subprocess (`npm run test`) and in-process worker (`src/worker.ts` / hosted E2E) both consume the CMS server differently. `npm run test:all` covers stdio; if the upgrade touches the hosted path, exercise `test:e2e` too.
- **`zod.uuid()` vs `zod.guid()`.** Umbraco emits non-RFC-4122 GUIDs. Output schemas / values Umbraco returns → `z.guid()`; LLM inputs → `z.string().uuid()`. A tool can pass integration tests yet fail on the wire with `-32602` if this is wrong.
- **`demo-site/` is gitignored.** Always edit `demo-site-template/`; the working site is rebuilt by `scripts/bootstrap-demo-site.sh`.
- **Fresh DB per upgrade.** Don't reuse the old version's DB; unattended install populates a new one and `create-api-user.mjs` recreates the API user (skip it and tests 401 with "client application was not found").
- **Eval `allTools` arrays.** New editor tools must be added to the `allTools` list in *every* eval file, or eval runs fail.
- **Snapshot updates.** Don't blanket `-u`. The user reviews snapshot drift per test.

## Reference

- At time of writing this repo pins `@umbraco-cms/mcp-dev@^17.5.1` with `demo-site` on `Umbraco.Cms 17.3.3`; the Dev MCP's own latest release line had moved to the `18.x` major (Umbraco 18) with the SDK/hosted packages on the `1.0.0-beta.x` track. Expect the major bump to bring both renamed CMS tools and a batch of new ones — budget time for the flow-discovery + wrapping steps (9–10).
- Deferred audit note (`CLAUDE.md`): the 11 tree-walking report tools are opt-in and were not part of the first live-audit campaign. If an upgrade changes tree/search CMS tools, remember these depend on them.
