# Demo-Site Template Restructure — Design

**Date:** 2026-04-24
**Status:** Approved for implementation
**Reference:** [umbraco-mcp-cms/demo-site-template](https://github.com/umbraco/umbraco-mcp-cms) (developer MCP)

## Goal

Restructure the editor MCP's local and CI Umbraco setup to match the pattern used by the developer MCP:

- A tracked, minimal `demo-site-template/` that is the source of truth
- A gitignored, bootstrapped `demo-site/` that is each developer's (and CI's) actual running instance
- All scripts centralised under `scripts/`
- Stale duplicated infrastructure removed (`infrastructure/`, root `umbraco/`)

The goal is consolidation, not new functionality. Today we carry two separate Umbraco projects (local `demo-site/` and CI `infrastructure/test-umbraco/MCPTestSite/`) plus duplicated scripts (`infrastructure/ci/*.mjs` vs `scripts/*.mjs`). The new layout makes both local dev and CI boot the same site from the same template.

## Non-goals

- Changing MCP tool behaviour
- Upgrading Umbraco versions or packages (Clean stays in, Umbraco.Workflow stays in)
- Rewriting worktree-remove.sh (no functional change)
- Restoring the demo-site.slnx or any IDE-specific files

## Current state (problems)

1. `demo-site/` is tracked in git, ~20 files including scaffolded assets
2. `infrastructure/test-umbraco/MCPTestSite/` is a *second* minimal Umbraco project used only by CI
3. `scripts/create-api-user.mjs` duplicates `infrastructure/ci/create-api-user.mjs`
4. `infrastructure/ci/publish-root-content.mjs` belongs with the other scripts
5. Root `umbraco/` has stale `McpOAuthComposer.cs` + `ProgramSnippet.cs` referenced nowhere
6. `.worktreeinclude` exists but is not consumed by `worktree-create.sh` — the script hardcodes `.env` and `demo-site/`

## Target layout

```
demo-site-template/                         # tracked
├── .gitignore                              # scoped (umbraco/, wwwroot/, appsettings.local.json, etc.)
├── Program.cs
├── McpOAuthComposer.cs
├── demo-site-template.csproj               # renamed to demo-site.csproj by bootstrap
├── appsettings.json
├── appsettings.Development.json
└── Properties/
    └── launchSettings.json

demo-site/                                  # gitignored, bootstrapped from template
# (scaffolded by Clean starter kit on first boot: Views/, wwwroot/, umbraco/)

scripts/
├── bootstrap-demo-site.sh                  # NEW — rsync template → demo-site, rename csproj
├── create-api-user.mjs                     # merged (single source)
├── publish-root-content.mjs                # MOVED from infrastructure/ci/
├── start-umbraco.sh                        # unchanged
├── start-umbraco.ps1                       # unchanged
├── stop-umbraco.sh                         # unchanged
├── get-demo-site-url.sh                    # unchanged
├── tunnels.sh                              # unchanged
├── worktree-create.sh                      # UPDATED — reads .worktreeinclude
└── worktree-remove.sh                      # unchanged

.worktreeinclude                            # UPDATED — lists .env and demo-site
```

**Removed:**
- `infrastructure/` (entire tree)
- `umbraco/` at repo root (entire tree)

## Design details

### Template contents (7 files)

Minimal, matching the reference. Anything scaffolded by Clean on first boot is excluded.

The template's `.gitignore` (copied verbatim to `demo-site/` via bootstrap) excludes:
- `appsettings.local.json` / `appsettings.Local.json`
- `appsettings-schema*.json`, `umbraco-package-schema.json`
- `/umbraco/` (runtime Data/Logs/Models)
- `/wwwroot/` (scaffolded assets)
- `/umbraco/Data/CreatedPackages/`, `/umbraco/Data/TEMP/`
- SQLite DB files, `/umbraco/Logs/`
- Standard .NET build artefacts (`bin/`, `obj/`, etc.)

The `.csproj` in the template is named `demo-site-template.csproj` so the tracked project can't accidentally be built in-place. Bootstrap renames it to `demo-site.csproj` on copy.

### `scripts/bootstrap-demo-site.sh`

Adapted from the reference. Idempotent: skips if `demo-site/` exists unless `--force`.

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATE_DIR="$PROJECT_DIR/demo-site-template"
SITE_DIR="$PROJECT_DIR/demo-site"

FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
  esac
done

if [ ! -d "$TEMPLATE_DIR" ]; then
  echo "Error: $TEMPLATE_DIR does not exist" >&2
  exit 1
fi

if [ -d "$SITE_DIR" ] && [ "$FORCE" -eq 0 ]; then
  echo "demo-site/ already exists; skipping bootstrap (pass --force to overwrite)" >&2
  exit 0
fi

if [ "$FORCE" -eq 1 ] && [ -d "$SITE_DIR" ]; then
  rm -rf "$SITE_DIR"
fi

rsync -a \
  --exclude='bin/' \
  --exclude='obj/' \
  --exclude='umbraco/' \
  --exclude='wwwroot/' \
  --exclude='appsettings.local.json' \
  --exclude='appsettings.Local.json' \
  "$TEMPLATE_DIR/" "$SITE_DIR/"

if [ -f "$SITE_DIR/demo-site-template.csproj" ]; then
  mv "$SITE_DIR/demo-site-template.csproj" "$SITE_DIR/demo-site.csproj"
fi

echo "demo-site/ created from demo-site-template/" >&2
```

### `package.json` scripts

Add:
```json
"umbraco:bootstrap": "bash scripts/bootstrap-demo-site.sh"
```

Update `start:umbraco` to bootstrap first:
```json
"start:umbraco": "bash scripts/bootstrap-demo-site.sh && bash scripts/start-umbraco.sh"
```

### `.worktreeinclude`-driven worktree-create

Update `.worktreeinclude` to be the authoritative list:
```
# Files/directories copied from main repo into new worktrees.
# One entry per line. Comments and blank lines are ignored.

.env
demo-site
```

Update `scripts/worktree-create.sh` to:
1. Remove the hardcoded `.env` copy block
2. Remove the hardcoded `demo-site/` rsync block
3. Add a loop that reads `.worktreeinclude` line-by-line (ignore `#` and blank), and for each entry:
   - If it's a file: `cp`
   - If it's a directory: `rsync -a` with the existing excludes (`bin/`, `obj/`, `umbraco/Data/*.sqlite*`, `umbraco/Logs/`, `appsettings.local.json`)
   - If neither exists, log a warning and continue
4. Everything after the include-copy block (db creation, launchSettings rewrite, npm install) stays unchanged

If `.worktreeinclude` doesn't exist, fall back to the current hardcoded behaviour (`.env` + `demo-site/`) so the script remains safe on old branches.

### CI rewrite (`.github/workflows/test.yml`)

Both jobs (integration + e2e) change the same way. Current:
```yaml
cd infrastructure/test-umbraco/MCPTestSite
dotnet run &
node infrastructure/ci/create-api-user.mjs http://localhost:56472 admin@admin.com 1234567890
node infrastructure/ci/publish-root-content.mjs http://localhost:56472
```

New:
```yaml
- name: Bootstrap demo-site from template
  run: npm run umbraco:bootstrap

- name: Write CI appsettings.local.json
  run: |
    cat > demo-site/appsettings.local.json << 'EOF'
    {
      "ConnectionStrings": {
        "umbracoDbDSN": "Data Source=|DataDirectory|/Umbraco.sqlite.db;Cache=Shared;Foreign Keys=True;Pooling=True",
        "umbracoDbDSN_ProviderName": "Microsoft.Data.Sqlite"
      }
    }
    EOF

- name: Start Umbraco
  run: |
    cd demo-site
    dotnet run --urls "http://localhost:56472;https://localhost:44386" &
    # existing wait-for-port loop preserved

- name: Create API user
  run: node scripts/create-api-user.mjs http://localhost:56472 admin@admin.com 1234567890

- name: Publish root content
  run: node scripts/publish-root-content.mjs http://localhost:56472
```

**Port preservation:** Existing workflow expects `http://localhost:56472`. Passing `--urls` to `dotnet run` pins the port regardless of what's in `launchSettings.json`, so the rest of the workflow (wait-for-port, create-api-user, publish-root-content) is unchanged.

**First-boot note:** Clean starter kit scaffolds Views/, wwwroot/, and seeds demo content on first boot. CI already waits for the Umbraco install to complete before running API calls, so no additional wait is needed — but we should verify timing on the first run.

**Tweak budget:** Expect to iterate on this until CI passes. Likely friction points: package restore cache, port binding, install-complete detection, initial DB seeding time. We tweak until green.

### Deletions

Only after CI passes on the branch:
- `rm -rf infrastructure/`
- `rm -rf umbraco/`

### Documentation updates

**CLAUDE.md:**
- Add a "Demo Site" section explaining the template/bootstrap model
- Update "Running Umbraco for tests" — replace `infrastructure/ci/create-api-user.mjs` with `scripts/create-api-user.mjs`
- Update "Git Worktrees" section to describe `.worktreeinclude`-driven copy

**README.md:**
- Add `npm run umbraco:bootstrap` as a first-time setup step

**.gitignore (root):**
- Ensure `demo-site/` is explicitly ignored (currently it is — check preserved)
- Remove any rules made redundant by the template's own `.gitignore`

## Implementation order

One branch, one big-bang-ish set of commits with iteration until CI is green:

1. Create `demo-site-template/` with the 7 files + template `.gitignore` (copies from current `demo-site/`)
2. Add `scripts/bootstrap-demo-site.sh` + `umbraco:bootstrap` npm script
3. Add `demo-site/` to root `.gitignore`; `git rm --cached` the now-template files under `demo-site/` (files stay on disk; current local instance keeps running)
4. Verify local hot path: `npm run start:umbraco` still boots (bootstrap is a no-op because `demo-site/` exists)
5. Verify bootstrap cold path: `rm -rf demo-site && npm run umbraco:bootstrap && npm run start:umbraco` boots and Clean scaffolds Views/wwwroot
6. Move `infrastructure/ci/publish-root-content.mjs` → `scripts/`; merge/unify `create-api-user.mjs` into `scripts/`
7. Update `.worktreeinclude`; rewrite `scripts/worktree-create.sh` to consume it
8. Rewrite `.github/workflows/test.yml` to use the bootstrap flow
9. Push → iterate on CI until green (tweak appsettings, port config, wait logic as needed)
10. Delete `infrastructure/` and root `umbraco/`
11. Update CLAUDE.md and README.md
12. Open PR

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Clean starter kit install time slows CI | Accept it — user confirmed OK. If too slow, revisit with an `appsettings.ci.json` override that disables seeding. |
| Port mismatches break CI assertions | Pin `--urls` on `dotnet run`; preserve 56472/44386. |
| First-boot install isn't complete when API-user script runs | Existing wait-for-port logic should cover this; add a readiness probe against `/umbraco/backoffice/umbracoapi/authentication/PostLogin` if needed. |
| `launchSettings.json` port rewrite in worktree-create breaks because template has different port | Current rewrite already uses `jq` with full-URL replacement — port number in source file doesn't matter. |
| CI e2e worker tests depend on hosted MCP client registration (McpOAuthComposer) | McpOAuthComposer is in the template — registration happens on boot, same as today. |
| Local dev loses custom Views/ files I've written | Any custom Views/ content lives in the gitignored `demo-site/`; if they need to be preserved they should be moved into the template. **Action: inventory current `demo-site/Views/` for anything non-scaffolded before deleting.** |
| Unattended-install creds in template mismatch CI expectations | Template `appsettings.Development.json` sets `admin@admin.com` / `1234567890` (matching `UMBRACO_ADMIN_EMAIL` / `UMBRACO_ADMIN_PASSWORD` env vars in the CI workflow). Existing local DBs are not affected (install is a no-op once a user exists). |

## Verification

- `npm run umbraco:bootstrap` on a clean checkout produces a bootable `demo-site/`
- `npm run start:umbraco` boots Umbraco with Clean starter kit
- `npm run test` passes locally against the bootstrapped site
- GitHub Actions `test.yml` jobs pass on PR branch
- `EnterWorktree` creates a working worktree with the worktree-include-driven copy
