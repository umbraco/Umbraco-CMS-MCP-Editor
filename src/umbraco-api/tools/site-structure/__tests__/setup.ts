/**
 * Site Structure Collection Test Setup
 *
 * Re-exports shared test utilities for site-structure integration tests.
 * This collection uses MCP chaining — all operations go via
 * `mcpClientManager.callTool("cms", ...)` and never call the Umbraco API directly.
 */

import { jest } from "@jest/globals";

export {
  setupTestEnvironment,
  createMockRequestHandlerExtra,
  getStructuredContent,
} from "@umbraco-cms/mcp-server-sdk/testing";

export { createEditorSnapshotResult as createSnapshotResult } from "../../../../testing/snapshot-helpers.js";
