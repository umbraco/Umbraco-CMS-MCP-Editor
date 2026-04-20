/**
 * Jest Global Setup for MSW
 *
 * This file is loaded by Jest's setupFilesAfterEnv configuration.
 * MSW is only started when USE_MOCK_API=true — integration tests that
 * hit the real Umbraco API run without MSW interception.
 */

import { setupMswServer } from "@umbraco-cms/mcp-server-sdk/testing";
import { server } from "./server.js";
import { resetStore } from "./store.js";

if (process.env.USE_MOCK_API === "true") {
  setupMswServer(server, resetStore);
}

// Connect CMS in-process — bypasses subprocess spawning for each test suite
if (process.env.USE_IN_PROCESS_CMS === "true") {
  const { connectInProcess } = await import("../testing/in-process-cms.js");
  const { mcpClientManager } = await import("../umbraco-api/mcp-client.js");
  connectInProcess(mcpClientManager);
}
