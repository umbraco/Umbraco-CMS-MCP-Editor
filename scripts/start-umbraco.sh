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
  # Capture the HTTPS port from "Now listening on: https://localhost:XXXXX" or "https://127.0.0.1:XXXXX"
  PORT=$(echo "$line" | sed -n 's/.*Now listening on: https:\/\/[^:]*:\([0-9]*\).*/\1/p')
  if [ -n "$PORT" ]; then
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

    # Ensure API user exists (runs in background, retries until Umbraco is ready)
    (
      NODE_TLS_REJECT_UNAUTHORIZED=0 node "$SCRIPT_DIR/create-api-user.mjs" "https://localhost:$PORT" 2>&1 | sed 's/^/==> [api-user] /'
    ) &
  fi
done
