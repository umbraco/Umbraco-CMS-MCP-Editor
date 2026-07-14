---
description: Upgrade the chained @umbraco-cms/mcp-dev server (and the demo-site Umbraco it drives) to the latest release, surface newly-available CMS tools, fix typed-chaining breakages, and wrap meaningful new tools.
argument-hint: "[mcp-dev version, e.g. 18.0.1 — omit for latest]"
---

# /upgrade-umbraco

Upgrade the **chained Umbraco CMS Developer MCP** (`@umbraco-cms/mcp-dev`) — and the demo-site Umbraco packages it talks to — to the latest release, diff the CMS tool surface to find newly-available tools, fix any typed-chaining breakages, run the tests, and wrap meaningful new CMS tools with editor-friendly interfaces.

Unlike the Developer MCP, **this server never connects to the Umbraco Management API directly**. Every tool delegates to `@umbraco-cms/mcp-dev` via MCP chaining (`AI Client → Editor MCP → CMS Dev MCP → Umbraco API`). So there is **no Orval / OpenAPI regeneration step here**. The "API surface" that matters to us is the *typed CMS tool registry* (`CmsTools` / `CmsToolsName` from `@umbraco-cms/mcp-dev/tool-types`) plus the runtime `collections` export. An upgrade means: bump the chained package, align the demo-site CMS version, and adapt to the tools that appear, disappear, or change shape.

## Usage

```
/upgrade-umbraco                   # upgrade @umbraco-cms/mcp-dev to latest stable
/upgrade-umbraco 18.0.1            # upgrade to a specific @umbraco-cms/mcp-dev version
```

ARGUMENTS: $ARGUMENTS

## Prerequisites

- SQL Server reachable from `demo-site/appsettings.local.json` (or a worktree DB — see below).
- A working `.env` with `UMBRACO_CLIENT_ID`, `UMBRACO_CLIENT_SECRET`, `UMBRACO_BASE_URL`.
- `dotnet`, `npm`, `node`, `curl`, `python3` on PATH.
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

The whole point of this command is to see what tools the upgrade adds/removes. Snapshot the current, permission-scoped tool surface the editor can chain to. This uses the same permissive user that `src/testing/in-process-cms.ts` uses to build the full tool map, so it reflects exactly what our chaining layer can reach:

```bash
npm run build   # ensure @umbraco-cms/mcp-dev is installed & importable
node --input-type=module -e '
  const { collections } = await import("@umbraco-cms/mcp-dev/collections");
  const permissiveUser = {
    fallbackPermissions: [
      "Umb.Document.Create","Umb.Document.Read","Umb.Document.Update",
      "Umb.Document.Delete","Umb.Document.Publish","Umb.Document.Unpublish",
      "Umb.Document.Move","Umb.Document.Sort","Umb.Document.Duplicate",
    ],
    allowedSections: [
      "Umb.Section.Content","Umb.Section.Media","Umb.Section.Settings",
      "Umb.Section.Users","Umb.Section.Members","Umb.Section.Packages",
      "Umb.Section.Translation",
    ],
    userGroupIds: [{ id: "E5E7F6C8-7F9C-4B5B-8D5D-9E1E5A4F7E4D" }],
  };
  const names = new Set();
  for (const c of collections) {
    const tools = typeof c.tools === "function" ? c.tools(permissiveUser) : c.tools;
    for (const t of tools) names.add(t.name);
  }
  console.log([...names].sort().join("\n"));
' | sort -u > /tmp/cms-tools-old.txt
echo "Captured $(wc -l < /tmp/cms-tools-old.txt) CMS tools (before)"
```

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

Capture the new surface with the exact same script from step 3, then diff:

```bash
# (re-run the step-3 node snippet) > /tmp/cms-tools-new.txt
echo "--- NEW CMS tools (candidates to wrap) ---"
comm -13 /tmp/cms-tools-old.txt /tmp/cms-tools-new.txt
echo "--- REMOVED CMS tools (must fix any chainCms callers) ---"
comm -23 /tmp/cms-tools-old.txt /tmp/cms-tools-new.txt
```

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
npm run stop:umbraco                          # stop anything still running
bash scripts/bootstrap-demo-site.sh --force   # rm -rf demo-site/ and recopy the upgraded template
# Ensure demo-site/appsettings.local.json points at a NEW, empty DB
# (the worktree hook already provisions one; otherwise create + point at a fresh DB name).
npm run start:umbraco                          # NuGet restore, build, unattended install on the fresh DB
```

`start:umbraco` writes the bound port to `.demo-site-port` and updates `UMBRACO_BASE_URL` in `.env`. In a worktree, `start:umbraco` (and the worktree hook) already run `scripts/create-api-user.mjs` for you against the fresh DB, so the API user + `umbraco-back-office-mcp` OAuth client normally exist by the time boot finishes. If you recycled the DB by hand, run it explicitly against the running instance's URL (idempotent — logs "API user already exists — skipping creation" if present):

```bash
node scripts/create-api-user.mjs "$UMBRACO_BASE_URL" admin@admin.com 1234567890
```

Because the DB is new, expect a clean unattended install in the boot log (not forward migrations).

### 8. Run the tests

```bash
npm run test:all       # integration + eval suites (build is included)
```

Triage failures into three buckets (same as the Dev MCP command, but the "contract" is the chained CMS tool, not a REST endpoint):

1. **Snapshot / response-shape drift** — the CMS tool now returns additive fields, new enum values, or reworded messages, so an editor tool's LLM-optimised output changed. Review the diff; if it's genuinely additive, update the snapshot (the user accepts snapshot diffs — don't blanket `-u`).
2. **Type-level breakages from new optional params** — pass the field explicitly (`field: undefined`) matching the pattern used for other optionals in the same file.
3. **Real regressions** — an editor tool no longer matches the CMS tool's contract (renamed field consumed in a mapping, changed required input, removed tool). Fix the wrapping tool.

Always run tests locally and get them green before pushing — CI runs against a fresh Umbraco install, so tests must build their own data (never snapshot pre-existing content).

### 9. Wrap meaningful new CMS tools

For each tool in the "NEW" list from step 5, decide:

- Is it already covered by an existing editor tool? (Editor tools are deliberately higher-level than the raw CMS tools — one editor tool may compose several.)
- Is it a meaningful new capability for an editorial LLM caller? (Not every low-level dev tool warrants an editor wrapper.)

When adding an editor tool, follow this repo's conventions (see `CLAUDE.md` → *Tool Conventions*):

- One file per tool under `src/umbraco-api/tools/<collection>/{get,post,put,delete}/`, registered in the collection's `index.ts`.
- Delegate via `chainCms("<cms-tool-name>", args)` from `src/umbraco-api/cms-chain.ts` — typed end-to-end. Prefer this over raw `mcpClientManager.callTool`.
- Export `withStandardDecorators(tool)`; hand-write Zod input/output schemas. Use `z.string().uuid()` for LLM input IDs and `z.guid()` for GUIDs Umbraco returns (version IDs especially — see `versioning/post/rollback-page.ts`).
- Use `confirmAction(...)` for writes; set `slices`, `annotations`, and register the collection in a mode (`config/mode-registry.ts`) / slices in `config/slice-registry.ts` as needed.
- Add an integration test under the collection's `__tests__/` that creates its own data, uses `setupTestEnvironment()` + `setupEditorElicitation` for writes, and calls tools via `callTool(...)` (runs the outputSchema, matching the wire). Snapshot only self-created data.
- **Add the new tool name to the `allTools` array in every eval file** under `tests/evals/` (each eval file maintains its own list).

Then live-validate each new tool through the running `.mcp.json` with the **`audit-tool` skill** — this closes the gap between "integration tests pass" and "the live chained MCP works" (`-32602` schema mismatches only show on the wire).

### 10. Report and hand off

Summarise:

- Old → new `@umbraco-cms/mcp-dev` (and sdk/hosted) versions, and old → new demo-site Umbraco version.
- **New CMS tools** (with the editor tool names you added to wrap them, or a note on why one was skipped).
- **Removed/renamed CMS tools** (must always be addressed — every `chainCms` caller depending on them fails).
- Modified response shapes worth flagging (deprecated/additive fields) and the tests whose snapshots drifted for the user to review.

Only open a PR when the user asks. If they do, push the branch and follow the repo's PR/CI workflow (`CLAUDE.md`): poll checks, read failing logs, fix, and loop until green before reporting the PR ready.

### 11. Refresh your primary checkout (after merge)

The upgrade happened in the worktree; your main checkout's `demo-site/` still runs the old version (`start:umbraco` skips re-bootstrapping when `demo-site/` exists). After the PR merges and you pull:

```bash
npm run stop:umbraco
bash scripts/bootstrap-demo-site.sh --force   # rm -rf demo-site/ and recopy the upgraded template
# Point demo-site/appsettings.local.json at a NEW, empty DB, then:
npm run start:umbraco
node scripts/create-api-user.mjs               # recreate API user + umbraco-back-office-mcp client
```

Confirm the running version: `grep 'Umbraco.Cms"' demo-site/demo-site.csproj` and watch the boot log for the port coming up.

## Common pitfalls

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

- At time of writing this repo pins `@umbraco-cms/mcp-dev@^17.5.1` with `demo-site` on `Umbraco.Cms 17.3.3`; the Dev MCP's own latest release line had moved to the `18.x` major (Umbraco 18) with the SDK/hosted packages on the `1.0.0-beta.x` track. Expect the major bump to bring both renamed CMS tools and a batch of new ones — budget time for step 9.
- Deferred audit note (`CLAUDE.md`): the 11 tree-walking report tools are opt-in and were not part of the first live-audit campaign. If an upgrade changes tree/search CMS tools, remember these depend on them.
