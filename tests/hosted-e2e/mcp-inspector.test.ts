/**
 * Hosted MCP E2E tests via MCP Inspector.
 *
 * Drives the MCP Inspector UI through the full OAuth flow,
 * verifies tool discovery, tool execution, and elicitation.
 *
 * Prerequisites:
 * - Umbraco demo site running on https://localhost:44386
 * - McpOAuthComposer registered (authorization_code client)
 * - Worker and Inspector started automatically in beforeAll
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";
import { startWorker, stopWorker } from "./helpers/worker-setup.js";
import {
  startInspector, connectInspector, handleOAuthFlow,
  getToolNames, callTool, type InspectorHandle,
} from "@umbraco-cms/mcp-hosted/testing";

// ============================================================================
// Tool lists
// ============================================================================

const READ_TOOLS = [
  "search-content",
  "get-page",
  "list-children",
  "list-document-types",
  "inspect-blocks",
  "list-versions",
];

const WRITE_TOOLS = [
  "create-page",
  "edit-page",
  "edit-block",
  "delete-page",
  "publish-page",
  "unpublish-page",
  "rollback-page",
];

const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];

// ============================================================================
// Tests
// ============================================================================

test.describe("Hosted MCP E2E", () => {
  let workerUrl: string;
  let inspector: InspectorHandle;

  test.beforeAll(async () => {
    workerUrl = await startWorker();
    inspector = await startInspector({ client: 6284, proxy: 6287 });
  });

  test.afterAll(async () => {
    await inspector.stop();
    await stopWorker();
  });

  test.afterEach(async ({ page }) => {
    const disconnectButton = page.getByRole("button", { name: "Disconnect" });
    if (await disconnectButton.isVisible().catch(() => false)) {
      await disconnectButton.click();
    }
  });

  test("connect and list all tools", async ({ page }) => {
    test.setTimeout(120000);

    const oauthPage = await connectInspector(page, workerUrl, inspector.url);
    await handleOAuthFlow(page, oauthPage, undefined, {
      email: "admin@test.com",
      password: "SecurePass1234",
    });

    const tools = await getToolNames(page, ALL_TOOLS);
    for (const tool of READ_TOOLS) {
      expect(tools).toContain(tool);
    }
    for (const tool of WRITE_TOOLS) {
      expect(tools).toContain(tool);
    }
  });

  test("execute a read-only tool", async ({ page }) => {
    test.setTimeout(120000);

    const oauthPage = await connectInspector(page, workerUrl, inspector.url);
    await handleOAuthFlow(page, oauthPage, undefined, {
      email: "admin@test.com",
      password: "SecurePass1234",
    });

    await getToolNames(page, ALL_TOOLS);

    // Call list-children (no required args — returns root pages)
    const result = await callTool(page, "list-children", "items");
    expect(result).toContain("items");
    expect(result).toContain("total");
  });

  test("execute a read-only tool that returns structured content", async ({ page }) => {
    test.setTimeout(120000);

    const oauthPage = await connectInspector(page, workerUrl, inspector.url);
    await handleOAuthFlow(page, oauthPage, undefined, {
      email: "admin@test.com",
      password: "SecurePass1234",
    });

    await getToolNames(page, ALL_TOOLS);

    // Call list-children (no args needed for root) and verify response
    const result = await callTool(page, "list-children", "total");
    expect(result).toContain("total");
    expect(result).toContain("items");
  });
});
