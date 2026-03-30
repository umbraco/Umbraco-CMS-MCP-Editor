/**
 * Content Workflow Eval Tests
 *
 * These tests use the Claude Agent SDK to verify that the editor MCP tools
 * work correctly when invoked by an LLM agent against a real Umbraco instance.
 *
 * The agent is given a prompt and access to specific tools, then we verify:
 * - The correct tools were called
 * - The agent reports success
 *
 * These tests require:
 * - A running Umbraco instance with content pages
 * - Valid credentials in .env (UMBRACO_CLIENT_ID, UMBRACO_CLIENT_SECRET, UMBRACO_BASE_URL)
 * - MCP chaining enabled (the editor tools delegate to the dev MCP)
 *
 * Note: Only read-only tools are tested here. Write operations require
 * elicitation which the eval framework does not support.
 */

import { describe, it } from "@jest/globals";
import {
  runScenarioTest,
  setupConsoleMock,
  getDefaultTimeoutMs,
} from "@umbraco-cms/mcp-server-sdk/evals";

describe("Content Workflows", () => {
  setupConsoleMock();

  const timeout = getDefaultTimeoutMs();

  it(
    "should search and read content",
    runScenarioTest({
      prompt:
        'Use the search-content tool to search for pages using the query "home". Then use get-page on the first result to show its full details. Do not ask me any questions — just do it.',
      tools: ["search-content", "get-page", "browse-children"],
      requiredTools: ["search-content", "get-page"],
      successPattern: /found|details|page|content|home/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "should browse site structure",
    runScenarioTest({
      prompt:
        "Use browse-children with no parentId to get the top-level pages. Then if any result has children, use browse-children again with that page's id to show its children. Do not ask me any questions.",
      tools: ["browse-children", "get-page"],
      requiredTools: ["browse-children"],
      successPattern: /root|top.level|children|pages|page/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "should view version history",
    runScenarioTest({
      prompt:
        "Use browse-children with no parentId to find a content page. Then use list-versions on the first page's id to show its version history. Do not ask me any questions — just do it.",
      tools: [
        "search-content",
        "get-page",
        "browse-children",
        "list-versions",
      ],
      requiredTools: ["list-versions"],
      successPattern: /version|history|versions/i,
      verbose: true,
    }),
    timeout
  );
});
