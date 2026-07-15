#!/usr/bin/env bash
set -euo pipefail

# Creates a working demo-site/ by copying demo-site-template/ into it.
# demo-site-template/ is the tracked source of truth; demo-site/ is
# gitignored and represents each developer/CI's actual running instance.
#
# Idempotent: skips the copy if demo-site/ already exists unless --force.
#
# Flags:
#   --force    Remove and recreate demo-site/ (and overwrite appsettings.local.json).
#   --sqlite   Write a SQLite appsettings.local.json so the site runs with no
#              external database server. The SQLite provider ships inside
#              Umbraco.Cms; on first boot Umbraco creates umbraco/Data/Umbraco.sqlite.db
#              and installs unattended. Handy for a plain dotnet box (no SQL Server /
#              Docker) — e.g. running the /upgrade-umbraco command or ad-hoc local work.
#              Without this flag the script leaves the DB config to you (the worktree
#              hook writes a SQL Server connection string for integration tests / CI).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TEMPLATE_DIR="$PROJECT_DIR/demo-site-template"
SITE_DIR="$PROJECT_DIR/demo-site"

FORCE=0
SQLITE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --sqlite) SQLITE=1 ;;
  esac
done

# Write a SQLite connection string into demo-site/appsettings.local.json (the
# gitignored local override loaded by Program.cs). Leaves an existing file alone
# unless --force, so it won't clobber a hand-tuned or SQL Server config by accident.
write_sqlite_config() {
  local target="$SITE_DIR/appsettings.local.json"
  if [ -f "$target" ] && [ "$FORCE" -eq 0 ]; then
    echo "appsettings.local.json already exists; leaving it untouched (pass --force to overwrite)" >&2
    return
  fi
  cat > "$target" <<'JSONEOF'
{
  "ConnectionStrings": {
    "umbracoDbDSN": "Data Source=|DataDirectory|/Umbraco.sqlite.db;Cache=Shared;Foreign Keys=True;Pooling=True",
    "umbracoDbDSN_ProviderName": "Microsoft.Data.Sqlite"
  }
}
JSONEOF
  echo "Wrote demo-site/appsettings.local.json using SQLite (umbraco/Data/Umbraco.sqlite.db)" >&2
}

if [ ! -d "$TEMPLATE_DIR" ]; then
  echo "Error: $TEMPLATE_DIR does not exist" >&2
  exit 1
fi

if [ -d "$SITE_DIR" ] && [ "$FORCE" -eq 0 ]; then
  echo "demo-site/ already exists; skipping copy (pass --force to overwrite)" >&2
  # Still honour --sqlite on an existing site so it can be added after the fact.
  if [ "$SQLITE" -eq 1 ]; then
    write_sqlite_config
  fi
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

if [ "$SQLITE" -eq 1 ]; then
  write_sqlite_config
  echo "Next steps:" >&2
  echo "  - Run 'npm run start:umbraco'  (SQLite DB is created on first boot)" >&2
else
  echo "Next steps:" >&2
  echo "  - Write demo-site/appsettings.local.json with your DB connection string" >&2
  echo "    (or re-run with --sqlite for a server-less SQLite database)" >&2
  echo "  - Run 'npm run start:umbraco'" >&2
fi
