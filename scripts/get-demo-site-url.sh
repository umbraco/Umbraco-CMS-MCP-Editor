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
