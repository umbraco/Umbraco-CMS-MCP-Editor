#!/usr/bin/env bash
set -e

# Stop the demo-site Umbraco process started by start-umbraco.sh in the
# current worktree / project. Idempotent — exits 0 even if nothing is running.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SITE_DIR="$PROJECT_DIR/demo-site"
PORT_FILE="$PROJECT_DIR/.demo-site-port"
PID_FILE="$PROJECT_DIR/.demo-site-pid"

killed=0

# 1. If start-umbraco.sh wrote its PID, kill that process group.
if [ -f "$PID_FILE" ]; then
  start_pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$start_pid" ] && kill -0 "$start_pid" 2>/dev/null; then
    echo "Stopping start-umbraco.sh (pid $start_pid)..."
    kill -TERM "$start_pid" 2>/dev/null || true
    killed=1
  fi
fi

# 2. Kill any compiled demo-site binary whose path is under this SITE_DIR.
#    The trap in start-umbraco.sh handles this when Ctrl+C'd, but the binary
#    gets re-parented to launchd if the script died ungracefully.
if pgrep -f "$SITE_DIR/bin/" >/dev/null 2>&1; then
  echo "Stopping demo-site binary under $SITE_DIR/bin/..."
  pkill -TERM -f "$SITE_DIR/bin/" 2>/dev/null || true
  killed=1
  sleep 1
  # SIGKILL survivors
  if pgrep -f "$SITE_DIR/bin/" >/dev/null 2>&1; then
    echo "Force-killing survivors..."
    pkill -KILL -f "$SITE_DIR/bin/" 2>/dev/null || true
  fi
fi

rm -f "$PORT_FILE" "$PID_FILE"

if [ "$killed" -eq 0 ]; then
  echo "No demo-site process was running."
else
  echo "Demo-site stopped."
fi
