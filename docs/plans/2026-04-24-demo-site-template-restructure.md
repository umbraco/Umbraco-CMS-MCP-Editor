# Demo-Site Template Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the tracked `demo-site/` with a minimal tracked `demo-site-template/` that bootstraps into a gitignored working `demo-site/`, consolidate all scripts under `scripts/`, and retire `infrastructure/` + root `umbraco/`.

**Architecture:** `demo-site-template/` (7 source files, tracked) is the source of truth. `scripts/bootstrap-demo-site.sh` rsyncs it to `demo-site/` (gitignored), renaming the csproj. Both local dev and CI run the bootstrap then `dotnet run`. `.worktreeinclude` becomes authoritative for what `worktree-create.sh` copies into new worktrees.

**Tech Stack:** Bash, rsync, jq, Node.js (CI helper scripts), GitHub Actions, Umbraco CMS 17 with Clean starter kit, SQL Server 2022 (CI) / local SQL Server (dev).

**Spec:** `docs/specs/2026-04-24-demo-site-template-restructure-design.md`

---

## File structure

**New:**
- `demo-site-template/.gitignore`
- `demo-site-template/Program.cs`
- `demo-site-template/McpOAuthComposer.cs`
- `demo-site-template/demo-site-template.csproj`
- `demo-site-template/appsettings.json`
- `demo-site-template/appsettings.Development.json`
- `demo-site-template/Properties/launchSettings.json`
- `scripts/bootstrap-demo-site.sh`
- `scripts/publish-root-content.mjs` (moved)

**Modified:**
- `package.json` — add `umbraco:bootstrap` script
- `.gitignore` — add `demo-site/` (or confirm already there)
- `.worktreeinclude` — list of entries to copy into worktrees
- `scripts/worktree-create.sh` — consume `.worktreeinclude`
- `.github/workflows/test.yml` — both `test` and `evals` jobs bootstrap + run `demo-site/`
- `CLAUDE.md` — document the template/bootstrap model
- `README.md` — first-time setup step

**Removed:**
- `infrastructure/` (entire tree)
- `umbraco/` at repo root (stale snippets)

---

## Task 1: Scaffold `demo-site-template/` directory

**Files:**
- Create: `demo-site-template/Program.cs`
- Create: `demo-site-template/McpOAuthComposer.cs`
- Create: `demo-site-template/demo-site-template.csproj`
- Create: `demo-site-template/appsettings.json`
- Create: `demo-site-template/appsettings.Development.json`
- Create: `demo-site-template/Properties/launchSettings.json`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p demo-site-template/Properties
```

- [ ] **Step 2: Copy Program.cs, McpOAuthComposer.cs, appsettings.*, launchSettings.json from current demo-site/**

```bash
cp demo-site/Program.cs demo-site-template/Program.cs
cp demo-site/McpOAuthComposer.cs demo-site-template/McpOAuthComposer.cs
cp demo-site/appsettings.json demo-site-template/appsettings.json
cp demo-site/appsettings.Development.json demo-site-template/appsettings.Development.json
cp demo-site/Properties/launchSettings.json demo-site-template/Properties/launchSettings.json
```

- [ ] **Step 3: Copy csproj and rename it to demo-site-template.csproj**

```bash
cp demo-site/demo-site.csproj demo-site-template/demo-site-template.csproj
```

- [ ] **Step 4: Strip the schema reference from appsettings.json** (the schema file is generated, so won't exist in a fresh demo-site)

Open `demo-site-template/appsettings.json` and remove the `"$schema": "appsettings-schema.json"` line if present.

Expected result: file no longer references `appsettings-schema.json`.

- [ ] **Step 5: Strip the schema reference from appsettings.Development.json**

Same edit for `demo-site-template/appsettings.Development.json`.

- [ ] **Step 5a: Align unattended-install credentials with CI env vars**

Edit `demo-site-template/appsettings.Development.json`. Find the `Umbraco.CMS.Unattended` block and replace values so a fresh bootstrap produces the admin user CI (and hosted E2E tests) expect.

Replace:

```json
      "Unattended": {
        "InstallUnattended": true,
        "UnattendedUserName": "Administrator",
        "UnattendedUserEmail": "admin@test.com",
        "UnattendedUserPassword": "SecurePass1234"
      },
```

With:

```json
      "Unattended": {
        "InstallUnattended": true,
        "UnattendedUserName": "Administrator",
        "UnattendedUserEmail": "admin@admin.com",
        "UnattendedUserPassword": "1234567890"
      },
```

Why: CI env vars are `UMBRACO_ADMIN_EMAIL=admin@admin.com` / `UMBRACO_ADMIN_PASSWORD=1234567890`, and all test fallbacks use those env vars. The previous `admin@test.com` / `SecurePass1234` was a local-only divergence from what CI installs.

Existing local Umbraco DBs are not affected — unattended install is a no-op when a user already exists.

- [ ] **Step 6: Verify files exist**

```bash
ls -la demo-site-template/ demo-site-template/Properties/
```

Expected: Program.cs, McpOAuthComposer.cs, demo-site-template.csproj, appsettings.json, appsettings.Development.json, Properties/launchSettings.json (6 files — `.gitignore` added next task)

---

## Task 2: Write the template `.gitignore`

**Files:**
- Create: `demo-site-template/.gitignore`

- [ ] **Step 1: Write the template .gitignore**

Content (adapted from reference project, covers all Umbraco-runtime and .NET build artefacts):

```gitignore
## Ignore Visual Studio temporary files, build results, and
## files generated by popular Visual Studio add-ons.

# User-specific files
*.rsuser
*.suo
*.user
*.userosscache
*.sln.docstates
*.userprefs

# Build results
[Dd]ebug/
[Dd]ebugPublic/
[Rr]elease/
[Rr]eleases/
x64/
x86/
[Ww][Ii][Nn]32/
[Aa][Rr][Mm]/
[Aa][Rr][Mm]64/
bld/
[Bb]in/
[Oo]bj/
[Ll]og/
[Ll]ogs/

# Visual Studio cache directory
.vs/

# .NET Core
project.lock.json
project.fragment.lock.json
artifacts/

# Node.js Tools for Visual Studio
node_modules/

# macOS
.DS_Store

##
## Umbraco CMS
##

# JSON schema files for appsettings.json
appsettings-schema.json
appsettings-schema.*.json

# Local appsettings (DB connection strings, local overrides)
appsettings.local.json
appsettings.Local.json

# JSON schema file for umbraco-package.json
umbraco-package-schema.json

# Umbraco generates wwwroot/ (static assets) and runtime data under
# umbraco/ on boot — neither belongs in git.
/umbraco/
/wwwroot/
```

- [ ] **Step 2: Verify contents**

```bash
head -5 demo-site-template/.gitignore && echo "---" && grep -E '^/umbraco/|^/wwwroot/|appsettings.local' demo-site-template/.gitignore
```

Expected: lines matching `/umbraco/`, `/wwwroot/`, `appsettings.local.json`, `appsettings.Local.json`.

- [ ] **Step 3: Commit the template**

```bash
git add demo-site-template/
git commit -m "feat: add demo-site-template as tracked source of truth

Mirrors reference pattern from umbraco-mcp-cms. Template holds only
non-scaffolded source files; Clean starter kit scaffolds Views/ and
wwwroot/ on first boot."
```

---

## Task 3: Create the bootstrap script

**Files:**
- Create: `scripts/bootstrap-demo-site.sh`

- [ ] **Step 1: Write scripts/bootstrap-demo-site.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Creates a working demo-site/ by copying demo-site-template/ into it.
# demo-site-template/ is the tracked source of truth; demo-site/ is
# gitignored and represents each developer/CI's actual running instance.
#
# Idempotent: skips the copy if demo-site/ already exists unless --force.

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
  echo "--force given; removing existing demo-site/" >&2
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
echo "Next steps:" >&2
echo "  - Write demo-site/appsettings.local.json with your DB connection string" >&2
echo "  - Run 'npm run start:umbraco'" >&2
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x scripts/bootstrap-demo-site.sh
```

- [ ] **Step 3: Test idempotent skip (demo-site already exists)**

```bash
bash scripts/bootstrap-demo-site.sh
```

Expected output: `demo-site/ already exists; skipping bootstrap (pass --force to overwrite)`

---

## Task 4: Add `umbraco:bootstrap` npm script

**Files:**
- Modify: `package.json` (scripts section)

- [ ] **Step 1: Read current scripts section**

```bash
jq '.scripts' package.json
```

- [ ] **Step 2: Add umbraco:bootstrap entry**

Edit `package.json`. Find the `"scripts"` block and add:

```json
"umbraco:bootstrap": "bash scripts/bootstrap-demo-site.sh",
```

Place it next to the other umbraco-related entries (after `"stop:umbraco"`).

- [ ] **Step 3: Verify it runs**

```bash
npm run umbraco:bootstrap
```

Expected: `demo-site/ already exists; skipping bootstrap (pass --force to overwrite)`

- [ ] **Step 4: Commit**

```bash
git add scripts/bootstrap-demo-site.sh package.json
git commit -m "feat: add bootstrap-demo-site script and umbraco:bootstrap npm task

Idempotent rsync from demo-site-template/ into demo-site/. Renames the
csproj so the assembly name matches the folder."
```

---

## Task 5: Gitignore `demo-site/` and untrack the template files

**Files:**
- Modify: `.gitignore`
- Remove (from git, keep on disk): tracked files under `demo-site/`

- [ ] **Step 1: Check current .gitignore for demo-site/**

```bash
grep -n "demo-site" .gitignore || echo "not present"
```

If present, no change needed. If not, append:

```
# demo-site/ is the actual working Umbraco instance. Generate it by
# copying demo-site-template/ via 'npm run umbraco:bootstrap'.
demo-site/
```

- [ ] **Step 2: Untrack the tracked files under demo-site/ (keep them on disk)**

```bash
git rm -r --cached demo-site/
```

This stages deletions for every currently-tracked file under `demo-site/`. Physical files remain on disk so your current local Umbraco instance keeps running.

- [ ] **Step 3: Verify `git status`**

```bash
git status | head -30
```

Expected: many `deleted: demo-site/...` entries staged, `.gitignore` modified (if edited).

- [ ] **Step 4: Verify demo-site/ is now fully ignored**

```bash
git check-ignore -v demo-site/Program.cs
```

Expected: output showing the `.gitignore` line that matches (confirms ignore is working).

- [ ] **Step 5: Commit**

```bash
git add .gitignore
git commit -m "refactor: untrack demo-site/; it's now bootstrapped from demo-site-template/

Files remain on disk as the local working instance. demo-site/ is
gitignored; Clean starter kit scaffolds Views/ and wwwroot/ on first
boot from a freshly-bootstrapped template."
```

---

## Task 6: Verify local hot path (existing demo-site/ still boots)

**Goal:** confirm the untrack didn't break the existing local instance.

- [ ] **Step 1: Boot Umbraco in background**

```bash
npm run start:umbraco &
```

- [ ] **Step 2: Wait for .demo-site-port to appear (up to 60s)**

```bash
for i in $(seq 1 60); do
  if [ -f .demo-site-port ]; then
    echo "Port: $(cat .demo-site-port)"
    break
  fi
  sleep 1
done
```

Expected: a port number (e.g. `44386`) written to `.demo-site-port`.

- [ ] **Step 3: Hit the server status endpoint**

```bash
PORT=$(cat .demo-site-port)
curl -skf "https://localhost:$PORT/umbraco/management/api/v1/server/status" && echo " — OK"
```

Expected: HTTP 200 with JSON, ` — OK`.

- [ ] **Step 4: Stop Umbraco**

```bash
npm run stop:umbraco
```

Expected: `Demo-site stopped.`

- [ ] **Step 5: No commit** (this task is verification only.)

---

## Task 7: Verify cold path (bootstrap from scratch)

**Goal:** confirm a fresh bootstrap produces a working site, so new worktrees and CI will work.

- [ ] **Step 1: Move the existing demo-site/ aside (for rollback safety)**

```bash
mv demo-site demo-site.backup
```

- [ ] **Step 2: Bootstrap**

```bash
npm run umbraco:bootstrap
```

Expected: `demo-site/ created from demo-site-template/`.

- [ ] **Step 3: Verify demo-site/ contents match template (minus scaffolded)**

```bash
ls demo-site/
```

Expected: `.gitignore`, `Program.cs`, `McpOAuthComposer.cs`, `demo-site.csproj` (renamed from template), `appsettings.json`, `appsettings.Development.json`, `Properties/`.

- [ ] **Step 4: Write a local appsettings.local.json so the fresh site can connect to SQL Server**

Copy the connection string from the backup:

```bash
cp demo-site.backup/appsettings.local.json demo-site/appsettings.local.json
```

- [ ] **Step 5: Boot Umbraco to trigger Clean scaffolding (may take 2-3 minutes on first run)**

```bash
npm run start:umbraco &
```

- [ ] **Step 6: Wait for `.demo-site-port` and confirm reachable**

```bash
for i in $(seq 1 180); do
  if [ -f .demo-site-port ]; then
    PORT=$(cat .demo-site-port)
    if curl -skf "https://localhost:$PORT/umbraco/management/api/v1/server/status" > /dev/null; then
      echo "Umbraco ready on port $PORT"
      break
    fi
  fi
  sleep 2
done
```

Expected: `Umbraco ready on port XXXXX` within 3 minutes.

- [ ] **Step 7: Verify Clean scaffolded Views and wwwroot**

```bash
ls demo-site/Views/ | head && echo "---" && ls demo-site/wwwroot/ | head
```

Expected: `home.cshtml`, `master.cshtml`, etc. in Views; static CSS/JS/media dirs in wwwroot.

- [ ] **Step 8: Stop Umbraco**

```bash
npm run stop:umbraco
```

- [ ] **Step 9: Restore the backup and remove the cold-path test site**

```bash
rm -rf demo-site
mv demo-site.backup demo-site
```

- [ ] **Step 10: No commit** (verification only.)

---

## Task 8: Consolidate `publish-root-content.mjs` into `scripts/`

**Files:**
- Create: `scripts/publish-root-content.mjs` (moved from `infrastructure/ci/`)

- [ ] **Step 1: Move the file**

```bash
git mv infrastructure/ci/publish-root-content.mjs scripts/publish-root-content.mjs
```

- [ ] **Step 2: Update the usage comment inside the moved file**

Edit `scripts/publish-root-content.mjs` line ~11 (the JSDoc Usage line):

```
 *   node scripts/publish-root-content.mjs [baseUrl]
```

(change `infrastructure/ci/` → `scripts/`)

- [ ] **Step 3: Verify it runs (syntax check)**

```bash
node --check scripts/publish-root-content.mjs && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Delete the duplicate create-api-user.mjs in infrastructure/**

(The `scripts/` version is newer — has retry logic. CI passes its defaults as args, so the embedded defaults don't matter.)

```bash
git rm infrastructure/ci/create-api-user.mjs
```

- [ ] **Step 5: Update the usage comment in `scripts/create-api-user.mjs` to reference its own path**

Open `scripts/create-api-user.mjs` — around line 15 the comment reads:

```
 *   node infrastructure/ci/create-api-user.mjs [baseUrl] [adminEmail] [adminPassword]
```

Change to:

```
 *   node scripts/create-api-user.mjs [baseUrl] [adminEmail] [adminPassword]
```

- [ ] **Step 6: Commit**

```bash
git add scripts/ infrastructure/
git commit -m "refactor: move publish-root-content.mjs and delete duplicate create-api-user.mjs

All CI helper scripts now live in scripts/. The duplicate
infrastructure/ci/create-api-user.mjs is removed — the scripts/ version
has retry logic and accepts the same CLI args."
```

---

## Task 9: Update `.worktreeinclude` with authoritative list

**Files:**
- Modify: `.worktreeinclude`

- [ ] **Step 1: Rewrite .worktreeinclude**

```
# Files and directories copied from the main repo into new worktrees.
# One entry per line. Lines starting with # and blank lines are ignored.
# Files are copied with cp; directories are rsynced with standard
# demo-site excludes.

# Environment config (API credentials for MCP tools)
.env

# Working Umbraco instance (gitignored, so must be copied explicitly)
demo-site
```

- [ ] **Step 2: No commit yet** (pairs with the worktree-create.sh rewrite in Task 10.)

---

## Task 10: Rewrite `worktree-create.sh` to consume `.worktreeinclude`

**Files:**
- Modify: `scripts/worktree-create.sh` (replace the hardcoded copy blocks with an include-driven loop)

- [ ] **Step 1: Locate the section in scripts/worktree-create.sh between "Copy .env" and "Create SQL Server database"**

Current lines to replace start at `# --- Copy .env ---` and end just before `# --- Create SQL Server database ---`.

- [ ] **Step 2: Replace both hardcoded copy blocks with a single .worktreeinclude-driven loop**

Replace this region:

```bash
# --- Copy .env ---
if [ -f "$PROJECT_DIR/.env" ]; then
  cp "$PROJECT_DIR/.env" "$WORKTREE_PATH/.env"
  echo "Copied: .env" >&2
fi

# --- Copy demo-site (gitignored, so not in worktree by default) ---
if [ -d "$PROJECT_DIR/demo-site" ]; then
  echo "Copying demo-site to worktree..." >&2
  rsync -a \
    --exclude='bin/' \
    --exclude='obj/' \
    --exclude='umbraco/Data/*.sqlite*' \
    --exclude='umbraco/Logs/' \
    --exclude='appsettings.local.json' \
    "$PROJECT_DIR/demo-site/" "$WORKTREE_PATH/demo-site/" >&2
  echo "Copied demo-site (excluding build artifacts and data)" >&2
fi
```

with:

```bash
# --- Copy files/directories listed in .worktreeinclude ---
INCLUDE_FILE="$PROJECT_DIR/.worktreeinclude"
if [ -f "$INCLUDE_FILE" ]; then
  while IFS= read -r line; do
    # Strip leading/trailing whitespace
    entry="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    # Skip blank and comment lines
    [ -z "$entry" ] && continue
    [[ "$entry" == \#* ]] && continue

    src="$PROJECT_DIR/$entry"
    dst="$WORKTREE_PATH/$entry"

    if [ -f "$src" ]; then
      mkdir -p "$(dirname "$dst")"
      cp "$src" "$dst"
      echo "Copied file: $entry" >&2
    elif [ -d "$src" ]; then
      echo "Copying directory: $entry" >&2
      rsync -a \
        --exclude='bin/' \
        --exclude='obj/' \
        --exclude='umbraco/Data/*.sqlite*' \
        --exclude='umbraco/Logs/' \
        --exclude='appsettings.local.json' \
        "$src/" "$dst/" >&2
    else
      echo "Warning: .worktreeinclude entry not found: $entry" >&2
    fi
  done < "$INCLUDE_FILE"
else
  # Fallback: preserve prior behaviour if .worktreeinclude is missing
  # (e.g. running this hook from an older branch).
  if [ -f "$PROJECT_DIR/.env" ]; then
    cp "$PROJECT_DIR/.env" "$WORKTREE_PATH/.env"
    echo "Copied: .env (fallback)" >&2
  fi
  if [ -d "$PROJECT_DIR/demo-site" ]; then
    rsync -a \
      --exclude='bin/' --exclude='obj/' \
      --exclude='umbraco/Data/*.sqlite*' --exclude='umbraco/Logs/' \
      --exclude='appsettings.local.json' \
      "$PROJECT_DIR/demo-site/" "$WORKTREE_PATH/demo-site/" >&2
    echo "Copied: demo-site/ (fallback)" >&2
  fi
fi
```

- [ ] **Step 3: Syntax-check the script**

```bash
bash -n scripts/worktree-create.sh && echo OK
```

Expected: `OK`.

- [ ] **Step 4: Commit both .worktreeinclude and the rewritten worktree-create.sh**

```bash
git add .worktreeinclude scripts/worktree-create.sh
git commit -m "refactor: drive worktree-create.sh from .worktreeinclude

Single source of truth for what gets copied into new worktrees. Files
are cp'd; directories are rsynced with the existing demo-site excludes.
Fallback to prior hardcoded behaviour if .worktreeinclude is missing."
```

---

## Task 11: Rewrite `.github/workflows/test.yml` — `test` job

**Files:**
- Modify: `.github/workflows/test.yml`

The `test` job currently:
1. Writes `appsettings.Local.json` into `infrastructure/test-umbraco/MCPTestSite/`
2. `cd infrastructure/test-umbraco/MCPTestSite && dotnet run ...`
3. `node infrastructure/ci/create-api-user.mjs ...`
4. `node infrastructure/ci/publish-root-content.mjs ...`

- [ ] **Step 1: Replace "Configure Umbraco for CI" step**

Find:

```yaml
      - name: Configure Umbraco for CI
        run: |
          cat > infrastructure/test-umbraco/MCPTestSite/appsettings.Local.json << 'EOF'
          {
            "ConnectionStrings": {
              "umbracoDbDSN": "Server=localhost,1433;Database=umbraco-mcp-ci;User Id=sa;password=Moloko99;TrustServerCertificate=True",
              "umbracoDbDSN_ProviderName": "Microsoft.Data.SqlClient"
            }
          }
          EOF
```

Replace with:

```yaml
      - name: Bootstrap demo-site from template
        run: npm run umbraco:bootstrap

      - name: Configure Umbraco for CI
        run: |
          cat > demo-site/appsettings.local.json << 'EOF'
          {
            "ConnectionStrings": {
              "umbracoDbDSN": "Server=localhost,1433;Database=umbraco-mcp-ci;User Id=sa;password=Moloko99;TrustServerCertificate=True",
              "umbracoDbDSN_ProviderName": "Microsoft.Data.SqlClient"
            }
          }
          EOF
```

- [ ] **Step 2: Replace "Start Umbraco" step to cd into demo-site/**

Find:

```yaml
      - name: Start Umbraco
        run: |
          cd infrastructure/test-umbraco/MCPTestSite
          ASPNETCORE_ENVIRONMENT=Development \
          ASPNETCORE_URLS="http://localhost:56472;https://localhost:44391" \
          dotnet run --no-launch-profile > /tmp/umbraco.log 2>&1 &
          echo $! > /tmp/umbraco.pid
```

Replace with:

```yaml
      - name: Start Umbraco
        run: |
          cd demo-site
          ASPNETCORE_ENVIRONMENT=Development \
          ASPNETCORE_URLS="http://localhost:56472;https://localhost:44391" \
          dotnet run --no-launch-profile > /tmp/umbraco.log 2>&1 &
          echo $! > /tmp/umbraco.pid
```

- [ ] **Step 3: Update "Create API user" step path**

Find:

```yaml
      - name: Create API user
        run: node infrastructure/ci/create-api-user.mjs http://localhost:56472 admin@admin.com 1234567890
```

Replace with:

```yaml
      - name: Create API user
        run: node scripts/create-api-user.mjs http://localhost:56472 admin@admin.com 1234567890
```

- [ ] **Step 4: Update "Publish root content" step path**

Find:

```yaml
      - name: Publish root content
        run: node infrastructure/ci/publish-root-content.mjs http://localhost:56472
```

Replace with:

```yaml
      - name: Publish root content
        run: node scripts/publish-root-content.mjs http://localhost:56472
```

---

## Task 12: Rewrite `.github/workflows/test.yml` — `evals` job

The `evals` job has the same four steps as `test`. Apply the same four edits:

- [ ] **Step 1: Insert bootstrap step, move appsettings.local.json to demo-site/**

Find in the `evals` job:

```yaml
      - name: Configure Umbraco for CI
        run: |
          cat > infrastructure/test-umbraco/MCPTestSite/appsettings.Local.json << 'EOF'
          {
            "ConnectionStrings": {
              "umbracoDbDSN": "Server=localhost,1433;Database=umbraco-mcp-ci-evals;User Id=sa;password=Moloko99;TrustServerCertificate=True",
              "umbracoDbDSN_ProviderName": "Microsoft.Data.SqlClient"
            }
          }
          EOF
```

Replace with:

```yaml
      - name: Bootstrap demo-site from template
        run: npm run umbraco:bootstrap

      - name: Configure Umbraco for CI
        run: |
          cat > demo-site/appsettings.local.json << 'EOF'
          {
            "ConnectionStrings": {
              "umbracoDbDSN": "Server=localhost,1433;Database=umbraco-mcp-ci-evals;User Id=sa;password=Moloko99;TrustServerCertificate=True",
              "umbracoDbDSN_ProviderName": "Microsoft.Data.SqlClient"
            }
          }
          EOF
```

- [ ] **Step 2: Update evals "Start Umbraco" to cd into demo-site/**

Same edit as Task 11 Step 2 — `cd infrastructure/test-umbraco/MCPTestSite` → `cd demo-site`.

- [ ] **Step 3: Update evals "Create API user" path**

Same edit as Task 11 Step 3.

- [ ] **Step 4: Update evals "Publish root content" path**

Same edit as Task 11 Step 4.

- [ ] **Step 5: Commit both CI jobs**

```bash
git add .github/workflows/test.yml
git commit -m "ci: bootstrap demo-site from template instead of MCPTestSite

Both test and evals jobs now run 'npm run umbraco:bootstrap' and boot
the generated demo-site/ with Clean starter kit. SQL Server connection
strings preserved; port bindings preserved via ASPNETCORE_URLS.

infrastructure/test-umbraco/MCPTestSite will be deleted in a follow-up
commit after CI passes on this PR."
```

---

## Task 13: Push and iterate on CI until green

**Goal:** get both CI jobs (`test` and `evals` when applicable) to pass on the feature branch. Expect to tweak.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/demo-site-template
```

- [ ] **Step 2: Open a draft PR**

```bash
gh pr create --draft --base dev --title "refactor: adopt demo-site-template pattern from developer MCP" \
  --body "$(cat <<'EOF'
## Summary
- Extract `demo-site/` source files into tracked `demo-site-template/`
- Gitignore `demo-site/` — it's now bootstrapped by `scripts/bootstrap-demo-site.sh`
- Consolidate all CI helper scripts under `scripts/`
- Make `.worktreeinclude` authoritative for worktree-create.sh
- Delete stale `infrastructure/` and root `umbraco/` (follow-up commit once CI is green)

## Test plan
- [ ] CI `test` job passes
- [ ] CI `evals` job passes (if applicable — runs only on PRs targeting main)
- [ ] Local hot path: `npm run start:umbraco` boots the existing demo-site/
- [ ] Local cold path: `rm -rf demo-site && npm run umbraco:bootstrap && npm run start:umbraco` boots and Clean scaffolds
- [ ] New worktree created by `EnterWorktree` copies `demo-site/` and `.env` correctly

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Monitor the first CI run**

```bash
gh pr checks --watch
```

- [ ] **Step 4: If CI fails, read the failing step logs**

```bash
gh run list --branch feature/demo-site-template --limit 1
gh run view <run-id> --log-failed
```

- [ ] **Step 5: Common failure modes and tweaks**

  - **Clean starter kit install timeout** — raise `timeout-minutes` on "Wait for Umbraco" step from 6 to 10. First-time install with Clean takes longer than the minimal MCPTestSite.
  - **Port binding collision** — check `tail -50 /tmp/umbraco.log`; if `launchSettings.json` conflicts with `ASPNETCORE_URLS`, add `--no-launch-profile` (already present) or delete `Properties/launchSettings.json` from the template.
  - **Database seed race (Umbraco hits tree endpoint before content seeded)** — extend `publish-root-content.mjs` retry loop, or poll `/umbraco/management/api/v1/tree/document/root` for non-empty items before publishing.
  - **ExamineIndex / PDF index missing** — reference project has a `Search/ExamineComposer.cs`. If editor tests need it, add to the template (out of scope if tests don't currently need it — check first).

- [ ] **Step 6: Commit tweaks as separate commits on the feature branch. Iterate until all jobs green.**

Do not proceed to Task 14 until `gh pr checks` shows all jobs passing.

---

## Task 14: Delete stale `infrastructure/` and root `umbraco/`

**Goal:** remove the now-unused folders once CI is green.

- [ ] **Step 1: Confirm nothing in the repo still references them**

```bash
grep -rn "infrastructure/test-umbraco\|infrastructure/ci" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" \
  --include="*.json" --include="*.yml" --include="*.yaml" \
  --include="*.sh" --include="*.toml" --include="*.cs" \
  2>/dev/null | grep -v node_modules | grep -v dist
```

Expected: no matches (only CLAUDE.md, which we'll update in Task 15).

```bash
grep -rn "^umbraco/\|\"umbraco/\|'umbraco/" \
  --include="*.ts" --include="*.js" --include="*.mjs" \
  --include="*.json" --include="*.yml" --include="*.yaml" \
  --include="*.sh" --include="*.toml" --include="*.cs" \
  --include="*.csproj" \
  2>/dev/null | grep -v node_modules | grep -v dist | grep -v "demo-site/umbraco\|demo-site-template/.gitignore"
```

Expected: no matches referencing the root `umbraco/` folder (the demo-site's `/umbraco/` folder is different).

- [ ] **Step 2: Delete the folders**

```bash
git rm -r infrastructure/ umbraco/
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: delete stale infrastructure/ and root umbraco/ folders

infrastructure/test-umbraco/MCPTestSite replaced by demo-site bootstrap.
infrastructure/ci/*.mjs consolidated into scripts/.
Root umbraco/ held stale McpOAuthComposer.cs + ProgramSnippet.cs that
weren't referenced anywhere."
```

---

## Task 15: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the "Git Worktrees" section**

Find the bullet list that starts `- \`.env\` is copied from the main repo`. Add a bullet about `.worktreeinclude`:

Current:
```markdown
- `.env` is copied from the main repo (API credentials)
- A new SQL Server database is created (`umbraco-mcp-editor-<slug>`)
```

Replace with:
```markdown
- Files listed in `.worktreeinclude` (currently `.env` and `demo-site`) are copied from the main repo
- A new SQL Server database is created (`umbraco-mcp-editor-<slug>`)
```

- [ ] **Step 2: Update the "Running Umbraco for tests" section**

Find:

```markdown
- The API user (`umbraco-back-office-mcp` / `1234567890`) is auto-created by `infrastructure/ci/create-api-user.mjs` as part of starting Umbraco in a worktree.
```

Replace with:

```markdown
- The API user (`umbraco-back-office-mcp` / `1234567890`) is auto-created by `scripts/create-api-user.mjs` as part of starting Umbraco in a worktree.
```

- [ ] **Step 3: Add a new "Demo Site" section between "Gitflow" and "Git Worktrees"**

```markdown
## Demo Site

The local Umbraco instance used by dev and CI lives in two places:

- `demo-site-template/` — tracked source of truth. Seven files: `Program.cs`, `McpOAuthComposer.cs`, `demo-site-template.csproj`, `appsettings.json`, `appsettings.Development.json`, `Properties/launchSettings.json`, `.gitignore`. Everything else (Views, wwwroot, umbraco/Data, compiled assemblies) is generated by Clean starter kit on first boot or by Umbraco at runtime.
- `demo-site/` — gitignored working instance. Created by `npm run umbraco:bootstrap`, which rsyncs the template and renames the csproj. Idempotent: skip if `demo-site/` exists, pass `--force` to overwrite.

`npm run start:umbraco` bootstraps if needed and then runs `dotnet run` on a dynamic port.
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document demo-site-template/bootstrap model in CLAUDE.md"
```

---

## Task 16: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current README.md to locate setup section**

```bash
head -80 README.md
```

- [ ] **Step 2: Add a one-liner about bootstrap in the setup section**

Near the existing installation/setup instructions, add:

```markdown
On first clone, run `npm run umbraco:bootstrap` to create `demo-site/` from `demo-site-template/`. Then start the CMS with `npm run start:umbraco`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: note umbraco:bootstrap as first-time setup step in README"
```

---

## Task 17: Mark PR ready for review

- [ ] **Step 1: Push all commits**

```bash
git push
```

- [ ] **Step 2: Verify CI still green after deletion and doc commits**

```bash
gh pr checks --watch
```

- [ ] **Step 3: Mark the PR ready for review**

```bash
gh pr ready
```

- [ ] **Step 4: Report PR URL**

```bash
gh pr view --json url --jq .url
```

Done — PR URL is the end of the work.
