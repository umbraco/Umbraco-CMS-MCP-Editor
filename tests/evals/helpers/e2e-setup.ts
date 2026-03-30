/**
 * Eval Test Setup
 *
 * Configures the eval test framework for this MCP server.
 * This runs before any tests via setupFilesAfterEnv in jest.config.ts.
 */

import path from "path";
import { configureEvals, ClaudeModels } from "@umbraco-cms/mcp-server-sdk/evals";

// Configure the eval framework for this MCP server
configureEvals({
  // Path to the built MCP server
  mcpServerPath: path.resolve(process.cwd(), "dist/index.js"),

  // MCP server name (used in tool name prefixes like mcp__umbraco-editor-mcp__tool-name)
  mcpServerName: "umbraco-editor-mcp",

  // Environment variables for the MCP server
  // Editor MCP tools delegate to the chained dev MCP, so chaining must be enabled.
  // Real Umbraco credentials are required — set them in your .env file.
  serverEnv: {
    NODE_TLS_REJECT_UNAUTHORIZED: "0",
    UMBRACO_CLIENT_ID: process.env.UMBRACO_CLIENT_ID || "umbraco-back-office-mcp",
    UMBRACO_CLIENT_SECRET: process.env.UMBRACO_CLIENT_SECRET || "1234567890",
    UMBRACO_BASE_URL: process.env.UMBRACO_BASE_URL || "https://localhost:44386",
  },

  // Test defaults
  defaultModel: ClaudeModels.Haiku,
  defaultMaxTurns: 10,
  defaultMaxBudgetUsd: 0.25,
  defaultTimeoutMs: 60000,
});
