/**
 * Shared reference to the MCP Server instance.
 *
 * Set once during server initialization in index.ts.
 * Used by tools that need server-level capabilities like elicitation.
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
