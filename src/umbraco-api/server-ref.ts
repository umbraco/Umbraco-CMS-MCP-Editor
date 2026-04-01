/**
 * Shared reference to the MCP Server instance.
 *
 * Set once during server initialization:
 * - Stdio mode: in index.ts at startup
 * - Hosted mode: in worker.ts DO init() per session
 *
 * DOs are single-threaded so a module-scoped ref is safe per instance.
 * This is equivalent to Cloudflare's `this.server.server` closure pattern
 * but works with tools in separate files.
 */
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";

let _server: Server | null = null;

export function setServerRef(server: Server): void {
  _server = server;
}

export function getServerRef(): Server {
  if (!_server) {
    throw new Error("Server reference not set. Call setServerRef() during initialization.");
  }
  return _server;
}
