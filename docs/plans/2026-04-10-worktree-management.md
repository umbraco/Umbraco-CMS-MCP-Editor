# Worktree Management System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate worktree lifecycle with Claude Code hooks — each worktree gets its own SQL Server database, dynamic port, and full isolation. Introduce gitflow with `dev` branch.

**Architecture:** Two shell scripts (`worktree-create.sh`, `worktree-remove.sh`) registered as Claude Code `WorktreeCreate`/`WorktreeRemove` hooks. The create script copies `.env`, creates a database, writes `appsettings.local.json`, rewrites `launchSettings.json` to port 0, and runs `npm install`. The remove script drops the database, kills processes, and removes the worktree. The `start-umbraco.sh` script is enhanced to capture the dynamic port and update `.env`.

**Tech Stack:** Bash scripts, Docker (SQL Server), dotnet CLI, Claude Code hooks API

**Spec:** `docs/specs/2026-04-10-worktree-management-design.md`

---

### Task 1: Create `dev` branch and push

**Files:**
- Modify: `CLAUDE.md` (gitflow section)

- [ ] **Step 1: Create dev branch from main**

```bash
git checkout main
git pull origin main
git checkout -b dev
git push -u origin dev
```

- [ ] **Step 2: Switch back to main for remaining work**

We'll implement on a feature branch from dev.

```bash
git checkout main
```

- [ ] **Step 3: Commit note — no file changes in this task, just branch creation**

---

### Task 2: Create feature branch for this work

**Files:** None yet

- [ ] **Step 1: Create feature branch from dev**

```bash
git checkout dev
git checkout -b feature/worktree-management
```

---

### Task 3: Create `.worktreeinclude`

**Files:**
- Create: `.worktreeinclude`

- [ ] **Step 1: Create the file**

```
# Files to copy into new worktrees
# Uses gitignore syntax — processed by git ls-files --others --ignored --exclude-from

# Environment config (API credentials for MCP tools)
.env
```

- [ ] **Step 2: Commit**

```bash
git add .worktreeinclude
git commit -m "chore: add .worktreeinclude for worktree file copying"
```

---

### Task 4: Fix `.gitignore`

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Replace `.worktrees` with correct entries**

Replace the line `.worktrees` at the end of `.gitignore` with:

```
# Worktree directories
.claude/worktrees/

# Demo site port discovery
.demo-site-port
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "fix: correct worktree gitignore path and add .demo-site-port"
```

---

### Task 5: Create `scripts/worktree-create.sh`

**Files:**
- Create: `scripts/worktree-create.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Claude Code WorktreeCreate hook
# Input: JSON on stdin: { "name": "<slug>", "cwd": "<project-root>" }
# Output: worktree path on stdout (last line)

# --- Parse input ---
INPUT=$(cat)
NAME=$(echo "$INPUT" | jq -r '.name // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

if [ -z "$NAME" ]; then
  echo "Error: no name provided" >&2
  exit 1
fi

# Use CLAUDE_PROJECT_DIR if available, fall back to cwd, then git root
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-${CWD:-$(git rev-parse --show-toplevel)}}"

# --- Derive identifiers ---
# Directory slug: replace / with -
DIR_SLUG=$(echo "$NAME" | tr '/' '-')

# Branch name: if name contains /, use as-is (e.g. PR branch); otherwise prefix with feature/
if [[ "$NAME" == *"/"* ]]; then
  BRANCH_NAME="$NAME"
else
  BRANCH_NAME="feature/$NAME"
fi

WORKTREE_PATH="$PROJECT_DIR/.claude/worktrees/$DIR_SLUG"
DB_NAME="umbraco-mcp-editor-$DIR_SLUG"

# --- Detect base branch ---
git -C "$PROJECT_DIR" fetch origin 2>/dev/null || true

BASE_BRANCH=""
for candidate in dev main master; do
  if git -C "$PROJECT_DIR" rev-parse --verify "origin/$candidate" >/dev/null 2>&1; then
    BASE_BRANCH="origin/$candidate"
    break
  fi
done

if [ -z "$BASE_BRANCH" ]; then
  echo "Error: could not find base branch (dev, main, or master)" >&2
  exit 1
fi

echo "Base branch: $BASE_BRANCH" >&2

# --- Handle existing worktree ---
if [ -d "$WORKTREE_PATH" ]; then
  echo "Worktree already exists at $WORKTREE_PATH" >&2
  echo "$WORKTREE_PATH"
  exit 0
fi

# --- Create worktree ---
mkdir -p "$(dirname "$WORKTREE_PATH")"

# Check if branch already exists locally
if git -C "$PROJECT_DIR" rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
  echo "Using existing local branch: $BRANCH_NAME" >&2
  git -C "$PROJECT_DIR" worktree add "$WORKTREE_PATH" "$BRANCH_NAME"
# Check if branch exists on remote
elif git -C "$PROJECT_DIR" rev-parse --verify "origin/$BRANCH_NAME" >/dev/null 2>&1; then
  echo "Tracking remote branch: origin/$BRANCH_NAME" >&2
  git -C "$PROJECT_DIR" worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" --track "origin/$BRANCH_NAME"
else
  echo "Creating new branch: $BRANCH_NAME from $BASE_BRANCH" >&2
  git -C "$PROJECT_DIR" worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" "$BASE_BRANCH"
fi

# --- Copy .worktreeinclude files ---
if [ -f "$PROJECT_DIR/.worktreeinclude" ]; then
  cd "$PROJECT_DIR"
  # Find untracked/ignored files matching .worktreeinclude patterns and copy them
  git ls-files --others --ignored --exclude-from=.worktreeinclude 2>/dev/null | while read -r file; do
    if [ -f "$file" ]; then
      target_dir="$WORKTREE_PATH/$(dirname "$file")"
      mkdir -p "$target_dir"
      cp "$file" "$WORKTREE_PATH/$file"
      echo "Copied: $file" >&2
    fi
  done
fi

# --- Create SQL Server database ---
echo "Creating database: $DB_NAME" >&2

# Read SA password from main worktree's appsettings.local.json
SA_PASSWORD=""
if [ -f "$PROJECT_DIR/demo-site/appsettings.local.json" ]; then
  SA_PASSWORD=$(jq -r '.ConnectionStrings.umbracoDbDSN // ""' "$PROJECT_DIR/demo-site/appsettings.local.json" | sed -n 's/.*password=\([^;]*\).*/\1/p')
fi

if [ -z "$SA_PASSWORD" ]; then
  echo "Warning: Could not read SA password from demo-site/appsettings.local.json" >&2
  echo "Skipping database creation — set up manually" >&2
else
  # Create database (ignore error if already exists)
  docker exec sql bash -c "/opt/mssql-tools*/bin/sqlcmd -S localhost -U sa -P '$SA_PASSWORD' -C -Q \"IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '$DB_NAME') CREATE DATABASE [$DB_NAME]\"" 2>/dev/null || {
    echo "Warning: Could not create database (is Docker running?)" >&2
  }

  # Write appsettings.local.json for the worktree
  cat > "$WORKTREE_PATH/demo-site/appsettings.local.json" <<JSONEOF
{
  "ConnectionStrings": {
    "umbracoDbDSN": "Server=localhost,1433;Database=$DB_NAME;User Id=sa;password=$SA_PASSWORD;TrustServerCertificate=True",
    "umbracoDbDSN_ProviderName": "Microsoft.Data.SqlClient"
  }
}
JSONEOF
  echo "Wrote demo-site/appsettings.local.json with database: $DB_NAME" >&2
fi

# --- Rewrite launchSettings.json to use dynamic port ---
LAUNCH_SETTINGS="$WORKTREE_PATH/demo-site/Properties/launchSettings.json"
if [ -f "$LAUNCH_SETTINGS" ]; then
  # Use jq to rewrite the applicationUrl to port 0
  jq '
    .profiles["Umbraco.Web.UI"].applicationUrl = "https://localhost:0;http://localhost:0" |
    .iisSettings.iisExpress.sslPort = 0 |
    .iisSettings.iisExpress.applicationUrl = "http://localhost:0"
  ' "$LAUNCH_SETTINGS" > "$LAUNCH_SETTINGS.tmp" && mv "$LAUNCH_SETTINGS.tmp" "$LAUNCH_SETTINGS"
  echo "Rewrote launchSettings.json to use dynamic port" >&2
fi

# --- Ensure .claude/worktrees/ is in .gitignore ---
GITIGNORE="$PROJECT_DIR/.gitignore"
if [ -f "$GITIGNORE" ] && ! grep -q '.claude/worktrees/' "$GITIGNORE"; then
  echo "" >> "$GITIGNORE"
  echo "# Worktree directories" >> "$GITIGNORE"
  echo ".claude/worktrees/" >> "$GITIGNORE"
  echo "Added .claude/worktrees/ to .gitignore" >&2
fi

# --- Run npm install ---
echo "Running npm install in worktree..." >&2
cd "$WORKTREE_PATH"
npm install --silent 2>&1 | tail -1 >&2 || {
  echo "Warning: npm install failed" >&2
}

# --- Output worktree path (Claude Code reads the last line) ---
echo "$WORKTREE_PATH"
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/worktree-create.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/worktree-create.sh
git commit -m "feat: add worktree-create.sh hook script"
```

---

### Task 6: Create `scripts/worktree-remove.sh`

**Files:**
- Create: `scripts/worktree-remove.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

# Claude Code WorktreeRemove hook
# Input: JSON on stdin: { "worktree_path": "<absolute-path>" }

# --- Parse input ---
INPUT=$(cat)
WORKTREE_PATH=$(echo "$INPUT" | jq -r '.worktree_path // empty')

if [ -z "$WORKTREE_PATH" ]; then
  echo "Error: no worktree_path provided" >&2
  exit 1
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || echo "")}"

# --- Derive identifiers ---
# Extract slug from path: .claude/worktrees/<slug>
DIR_SLUG=$(basename "$WORKTREE_PATH")
DB_NAME="umbraco-mcp-editor-$DIR_SLUG"

echo "Removing worktree: $DIR_SLUG" >&2

# --- Kill running demo-site process ---
DEMO_PID=$(lsof -ti :0 -c dotnet 2>/dev/null || true)
# More targeted: find dotnet processes running from this worktree
if pgrep -f "dotnet.*$WORKTREE_PATH/demo-site" >/dev/null 2>&1; then
  echo "Killing demo-site process..." >&2
  pkill -f "dotnet.*$WORKTREE_PATH/demo-site" 2>/dev/null || true
  sleep 1
fi

# --- Drop database ---
echo "Dropping database: $DB_NAME" >&2

SA_PASSWORD=""
if [ -n "$PROJECT_DIR" ] && [ -f "$PROJECT_DIR/demo-site/appsettings.local.json" ]; then
  SA_PASSWORD=$(jq -r '.ConnectionStrings.umbracoDbDSN // ""' "$PROJECT_DIR/demo-site/appsettings.local.json" | sed -n 's/.*password=\([^;]*\).*/\1/p')
fi

if [ -n "$SA_PASSWORD" ]; then
  docker exec sql bash -c "/opt/mssql-tools*/bin/sqlcmd -S localhost -U sa -P '$SA_PASSWORD' -C -Q \"
    IF EXISTS (SELECT name FROM sys.databases WHERE name = '$DB_NAME')
    BEGIN
      ALTER DATABASE [$DB_NAME] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
      DROP DATABASE [$DB_NAME];
    END
  \"" 2>/dev/null || {
    echo "Warning: Could not drop database $DB_NAME" >&2
  }
else
  echo "Warning: Could not read SA password — skipping database drop" >&2
fi

# --- Remove worktree ---
if [ -n "$PROJECT_DIR" ]; then
  git -C "$PROJECT_DIR" worktree remove --force "$WORKTREE_PATH" 2>/dev/null || {
    echo "Force remove failed, trying prune + rm..." >&2
    git -C "$PROJECT_DIR" worktree prune 2>/dev/null || true
    rm -rf "$WORKTREE_PATH" 2>/dev/null || true
  }
else
  rm -rf "$WORKTREE_PATH" 2>/dev/null || true
fi

echo "Worktree $DIR_SLUG removed" >&2
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/worktree-remove.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/worktree-remove.sh
git commit -m "feat: add worktree-remove.sh hook script"
```

---

### Task 7: Enhance `scripts/start-umbraco.sh` for port discovery

**Files:**
- Modify: `scripts/start-umbraco.sh`

- [ ] **Step 1: Rewrite the script to capture port and update .env**

Replace the entire contents of `scripts/start-umbraco.sh` with:

```bash
#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SITE_DIR="$PROJECT_DIR/demo-site"
PORT_FILE="$PROJECT_DIR/.demo-site-port"
ENV_FILE="$PROJECT_DIR/.env"

if ! ls "$SITE_DIR"/*.csproj >/dev/null 2>&1; then
  echo "No Umbraco instance found in demo-site/"
  echo ""
  echo "Create one with:"
  echo "  npx @umbraco-cms/create-umbraco-mcp-server init"
  exit 1
fi

# Clean up port file on exit
cleanup() {
  rm -f "$PORT_FILE"
}
trap cleanup EXIT

echo "Starting Umbraco from demo-site/..."
cd "$SITE_DIR"

# Run dotnet and capture output to detect the bound port
dotnet run 2>&1 | while IFS= read -r line; do
  echo "$line"
  # Capture the HTTPS port from "Now listening on: https://localhost:XXXXX"
  if [[ "$line" =~ "Now listening on: https://localhost:"([0-9]+) ]]; then
    PORT="${BASH_REMATCH[1]}"
    echo "$PORT" > "$PORT_FILE"
    echo ""
    echo "==> Umbraco available at: https://localhost:$PORT"
    echo "==> Port written to: $PORT_FILE"

    # Update UMBRACO_BASE_URL in .env if it exists
    if [ -f "$ENV_FILE" ]; then
      if grep -q "^UMBRACO_BASE_URL=" "$ENV_FILE"; then
        sed -i.bak "s|^UMBRACO_BASE_URL=.*|UMBRACO_BASE_URL=https://localhost:$PORT|" "$ENV_FILE"
        rm -f "$ENV_FILE.bak"
        echo "==> Updated UMBRACO_BASE_URL in .env"
      fi
    fi
  fi
done
```

- [ ] **Step 2: Commit**

```bash
git add scripts/start-umbraco.sh
git commit -m "feat: enhance start-umbraco.sh with port discovery and .env update"
```

---

### Task 8: Create `scripts/get-demo-site-url.sh`

**Files:**
- Create: `scripts/get-demo-site-url.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Returns the URL of the running demo site for the current project directory

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PORT_FILE="$PROJECT_DIR/.demo-site-port"

if [ -f "$PORT_FILE" ]; then
  PORT=$(cat "$PORT_FILE")
  echo "https://localhost:$PORT"
else
  echo "Demo site not running (no .demo-site-port file)" >&2
  exit 1
fi
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/get-demo-site-url.sh
```

- [ ] **Step 3: Commit**

```bash
git add scripts/get-demo-site-url.sh
git commit -m "feat: add get-demo-site-url.sh helper script"
```

---

### Task 9: Register hooks in `.claude/settings.json`

**Files:**
- Modify: `.claude/settings.json`

- [ ] **Step 1: Add hook registrations**

The existing file has a `permissions` key. Add `hooks` alongside it. The final file should be:

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run compile*)",
      "Bash(npm run build*)",
      "Bash(npm run generate*)",
      "Bash(npm test*)",
      "Bash(npx tsc*)",
      "Bash(node *)",
      "Bash(curl *)",
      "Bash(mkdir *)",
      "Bash(mkdir -p *)",
      "Bash(ls *)",
      "Bash(lsof -ti :*)",
      "Bash(pkill -f 'dotnet.*demo-site'*)",
      "Bash(dotnet build *)",
      "Bash(dotnet run *)"
    ]
  },
  "hooks": {
    "WorktreeCreate": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR\"/scripts/worktree-create.sh",
            "timeout": 120
          }
        ]
      }
    ],
    "WorktreeRemove": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR\"/scripts/worktree-remove.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add .claude/settings.json
git commit -m "feat: register WorktreeCreate and WorktreeRemove hooks"
```

---

### Task 10: Update statusline in `.claude/settings.local.json`

**Files:**
- Modify: `.claude/settings.local.json`

- [ ] **Step 1: Update the statusline command to include Umbraco port**

Replace the statusline command. The new version reads `.demo-site-port` if it exists:

```json
{
  "enabledPlugins": {
    "umbraco-mcp-skills@umbraco-mcp-server-sdk-plugins": true
  },
  "statusLine": {
    "type": "command",
    "command": "input=$(cat); worktree_path=$(echo \"$input\" | jq -r '.worktree.path // empty'); if [ -n \"$worktree_path\" ]; then worktree_name=$(echo \"$worktree_path\" | sed 's|.*\\.claude/worktrees/||'); git_dir=\"$worktree_path\"; else worktree_name=\"main\"; git_dir=/Users/philw/Projects/umbraco-mcp-editor-cms; fi; branch=$(git -C \"$git_dir\" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null || echo \"unknown\"); port_file=\"$git_dir/.demo-site-port\"; if [ -f \"$port_file\" ]; then port=\":$(cat \"$port_file\")\"; else port=\"off\"; fi; echo \"$worktree_name | $branch | umbraco: $port\""
  }
}
```

Note: this file is in `.gitignore` (`.claude/settings.local.json`), so it won't be committed. Document the recommended statusline in CLAUDE.md instead.

- [ ] **Step 2: No commit needed — this file is gitignored**

---

### Task 11: Update `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Replace the Git Worktrees section and add Gitflow section**

Replace the existing `## Git Worktrees` section (lines 11-13) with:

```markdown
## Gitflow

- `dev` — integration branch, all feature branches merge here
- `main` — release branch, only merged from `dev`
- Feature branches: `feature/<name>` (auto-prefixed by worktree hook)

## Git Worktrees

This project uses git worktrees for feature work. Use `EnterWorktree` to create or enter a worktree — hooks in `.claude/settings.json` handle everything automatically:

- `.env` is copied from the main repo (API credentials)
- A new SQL Server database is created (`umbraco-mcp-editor-<slug>`)
- `demo-site/appsettings.local.json` is written with the worktree database connection string
- `demo-site/Properties/launchSettings.json` is rewritten to use a dynamic port (port 0)
- `npm install` runs automatically

First `dotnet run` in a new worktree triggers Umbraco unattended install in the new database.

**Running the demo site in a worktree:**

`npm run start:umbraco` — starts Umbraco on a random available port. The port is written to `.demo-site-port` and `UMBRACO_BASE_URL` in `.env` is updated automatically.

**Cleanup:**

Use `ExitWorktree` with remove action, or the `/cleanup` skill. The hook drops the worktree database and removes the worktree directory.

**Statusline (recommended for `.claude/settings.local.json`):**

```json
{
  "statusLine": {
    "type": "command",
    "command": "input=$(cat); worktree_path=$(echo \"$input\" | jq -r '.worktree.path // empty'); if [ -n \"$worktree_path\" ]; then worktree_name=$(echo \"$worktree_path\" | sed 's|.*\\.claude/worktrees/||'); git_dir=\"$worktree_path\"; else worktree_name=\"main\"; git_dir=$(pwd); fi; branch=$(git -C \"$git_dir\" --no-optional-locks rev-parse --abbrev-ref HEAD 2>/dev/null || echo \"unknown\"); port_file=\"$git_dir/.demo-site-port\"; if [ -f \"$port_file\" ]; then port=\":$(cat \"$port_file\")\"; else port=\"off\"; fi; echo \"$worktree_name | $branch | umbraco: $port\""
  }
}
```
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with gitflow and worktree automation docs"
```

---

### Task 12: End-to-end test — create worktree, run Umbraco, run tests, destroy

This task verifies the entire system works. Run it manually.

- [ ] **Step 1: Create a test worktree**

Use `EnterWorktree` with name `test-worktree-system`. The hook should:
- Create `.claude/worktrees/test-worktree-system/`
- Create branch `feature/test-worktree-system` from `dev`
- Copy `.env`
- Create database `umbraco-mcp-editor-test-worktree-system`
- Write `appsettings.local.json`
- Rewrite `launchSettings.json` to port 0
- Run `npm install`

Verify each of these happened.

- [ ] **Step 2: Verify database was created**

```bash
docker exec sql bash -c "/opt/mssql-tools*/bin/sqlcmd -S localhost -U sa -P 'Moloko99' -C -Q \"SELECT name FROM sys.databases WHERE name = 'umbraco-mcp-editor-test-worktree-system'\""
```

Expected: one row with the database name.

- [ ] **Step 3: Verify launchSettings.json was rewritten**

Read `.claude/worktrees/test-worktree-system/demo-site/Properties/launchSettings.json` and check the applicationUrl contains `localhost:0`.

- [ ] **Step 4: Verify .env was copied**

Check `.claude/worktrees/test-worktree-system/.env` exists and contains `UMBRACO_BASE_URL`.

- [ ] **Step 5: Start Umbraco in the worktree**

```bash
npm run start:umbraco
```

Wait for it to start. Verify:
- `.demo-site-port` file was created
- Port is a real number (not 0)
- `UMBRACO_BASE_URL` in `.env` was updated to the new port
- Umbraco responds at the new URL

- [ ] **Step 6: Run integration tests**

```bash
npm run build
npm test
```

Tests should pass against the worktree's Umbraco instance.

- [ ] **Step 7: Run eval tests**

```bash
npm run test:evals
```

Evals should pass.

- [ ] **Step 8: Stop Umbraco and destroy the worktree**

Stop the dotnet process, then use `ExitWorktree` with remove action. Verify:
- Database `umbraco-mcp-editor-test-worktree-system` was dropped
- Directory `.claude/worktrees/test-worktree-system/` no longer exists
- `git worktree list` does not show the worktree

- [ ] **Step 9: If everything passed, the system works**

If any step failed, debug and fix before proceeding. Do not create a PR until all steps pass.

---

### Task 13: Create PR

Only after Task 12 passes completely.

- [ ] **Step 1: Push and create PR**

```bash
git push -u origin feature/worktree-management
```

Create PR targeting `dev` with title "feat: worktree management system with hooks, DB isolation, and dynamic ports".
