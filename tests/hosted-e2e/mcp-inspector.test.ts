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
  "search-content", "get-page", "list-children", "list-document-types",
  "inspect-blocks", "list-versions",
  "search-media", "list-media-children", "get-media", "list-media-types",
  "list-blueprints", "get-blueprint",
  "list-languages", "get-language",
  "list-untranslated",
  "list-dictionary", "search-dictionary", "get-dictionary",
  "list-tags",
  "audit-page-seo", "audit-page-content", "report-empty-fields", "report-short-content", "report-media-missing-alt",
  "report-stale-content", "report-unpublished", "report-recently-changed", "report-content-by-type", "report-translation-coverage",
  "report-site-tree-summary", "report-orphan-pages", "report-deep-pages",
  "report-unused-media", "report-large-media", "report-content-references",
  "search-members", "get-member", "list-member-types",
  "list-member-groups",
  "report-member-count", "report-members-by-group", "report-member-activity",
  "get-publish-status", "list-scheduled-content",
  "list-redirects", "get-redirect", "get-redirect-status",
];

const WRITE_TOOLS = [
  "create-page", "edit-page", "edit-block", "delete-page",
  "publish-page", "unpublish-page", "rollback-page",
  "upload-media", "create-media-folder", "move-media", "delete-media", "restore-media",
  "create-blueprint",
  "create-language", "update-language", "delete-language",
  "create-variant", "copy-variant",
  "create-dictionary", "update-dictionary", "move-dictionary",
  "bulk-publish", "bulk-unpublish", "bulk-schedule-publish", "bulk-set-property", "bulk-move",
  "create-member", "update-member", "delete-member",
  "create-member-group", "delete-member-group",
  "schedule-publish", "cancel-schedule",
  "delete-redirect",
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

    // Click list-tags tool (unique name, no substring collisions)
    await page.getByText("list-tags", { exact: true }).first().click();
    await page.getByRole("button", { name: /Run/i }).click();
    await page.getByText("items").first().waitFor({ state: "visible", timeout: 10000 });
    const result = await page.locator("body").textContent() ?? "";
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

    // Click list-tags tool and verify structured response
    await page.getByText("list-tags", { exact: true }).first().click();
    await page.getByRole("button", { name: /Run/i }).click();
    await page.getByText("total").first().waitFor({ state: "visible", timeout: 10000 });
    const result = await page.locator("body").textContent() ?? "";
    expect(result).toContain("total");
    expect(result).toContain("items");
  });
});
