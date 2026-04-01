/**
 * Content Workflow Eval Tests
 *
 * These tests simulate realistic editor requests — natural language prompts
 * that a content editor would actually say. The LLM must figure out which
 * tools to use based on tool descriptions alone.
 *
 * This validates that:
 * - Tool descriptions are clear enough for the LLM to pick the right tool
 * - Tools return useful, editor-friendly responses
 * - Multi-step workflows work end-to-end
 *
 * These tests require:
 * - A running Umbraco instance with content pages
 * - Valid credentials in .env
 * - MCP chaining enabled
 *
 * Write operations use elicitation which is auto-accepted by the eval runner.
 */

import { describe, it } from "@jest/globals";
import {
  runScenarioTest,
  setupConsoleMock,
  getDefaultTimeoutMs,
} from "@umbraco-cms/mcp-server-sdk/evals";

describe("Editor Content Workflows", () => {
  setupConsoleMock();

  const timeout = getDefaultTimeoutMs();

  it(
    "editor asks to find a specific page and see its content",
    runScenarioTest({
      prompt:
        "Can you find the homepage and show me what content is on it?",
      tools: ["search-content", "get-page", "list-children"],
      requiredTools: ["get-page"],
      successPattern: /home|content|field|value|page/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks what pages are on the site",
    runScenarioTest({
      prompt:
        "What pages do we have on the site? Give me an overview of the site structure.",
      tools: ["list-children", "get-page", "search-content"],
      requiredTools: ["list-children"],
      successPattern: /home|page|site|structure/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks about version history of a page",
    runScenarioTest({
      prompt:
        "Has anyone made changes to the homepage recently? Show me its version history.",
      tools: [
        "search-content",
        "get-page",
        "list-children",
        "list-versions",
      ],
      requiredTools: ["list-versions"],
      successPattern: /version|change|history|date|modified/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks to publish a page (elicitation auto-confirmed)",
    runScenarioTest({
      prompt:
        "Find the homepage and publish it for me.",
      tools: [
        "search-content",
        "get-page",
        "list-children",
        "publish-page",
      ],
      requiredTools: ["publish-page"],
      successPattern: /publish|live|published/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor searches for content by topic",
    runScenarioTest({
      prompt:
        "I'm looking for any pages that mention 'home' — can you find them for me?",
      tools: ["search-content", "get-page", "list-children"],
      requiredTools: ["search-content"],
      successPattern: /found|result|match|home|page/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor wants to drill into a section of the site",
    runScenarioTest({
      prompt:
        "Show me the top-level pages, then drill into whichever one has child pages so I can see what's underneath it.",
      tools: ["list-children", "get-page"],
      requiredTools: ["list-children"],
      successPattern: /child|under|page|section/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks what page types are available",
    runScenarioTest({
      prompt:
        "What types of pages can I create on this site?",
      tools: ["list-document-types", "list-children", "get-page"],
      requiredTools: ["list-document-types"],
      successPattern: /type|document|template|content/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks to update content on a page",
    runScenarioTest({
      prompt:
        "Find the homepage and update its title field to 'Welcome to Our Site'.",
      tools: [
        "search-content",
        "get-page",
        "list-children",
        "edit-page",
      ],
      requiredTools: ["edit-page"],
      successPattern: /update|edit|saved|changed|field/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks to take a page offline",
    runScenarioTest({
      prompt:
        "Can you unpublish the homepage? We need to take it offline temporarily.",
      tools: [
        "search-content",
        "get-page",
        "list-children",
        "unpublish-page",
      ],
      requiredTools: ["unpublish-page"],
      successPattern: /unpublish|offline|draft|removed/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks to revert a page to a previous version",
    runScenarioTest({
      prompt:
        "The homepage was changed by mistake. Can you roll it back to the previous version?",
      tools: [
        "search-content",
        "get-page",
        "list-children",
        "list-versions",
        "rollback-page",
      ],
      requiredTools: ["list-versions", "rollback-page"],
      successPattern: /roll|revert|version|previous|restored/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks what blocks are on a page",
    runScenarioTest({
      prompt:
        "Show me the block content structure of the homepage — I want to see what blocks are on the page and what's in them.",
      tools: [
        "search-content",
        "get-page",
        "list-children",
        "inspect-blocks",
      ],
      requiredTools: ["inspect-blocks"],
      successPattern: /block|content|property|structure|no block/i,
      verbose: true,
    }),
    timeout
  );
});
