/**
 * Read-Only Workflow Eval Tests
 *
 * These tests are safe to run in parallel — they only read content,
 * never mutate it. Split from write workflows to enable parallel execution.
 */

import { describe, it } from "@jest/globals";
import {
  runScenarioTest,
  setupConsoleMock,
  getDefaultTimeoutMs,
} from "@umbraco-cms/mcp-server-sdk/evals";

const allTools = [
  "search-content",
  "get-page",
  "list-children",
  "list-document-types",
  "inspect-blocks",
  "create-page",
  "edit-page",
  "edit-block",
  "delete-page",
  "publish-page",
  "unpublish-page",
  "list-versions",
  "rollback-page",
];

describe("Read-Only Workflows", () => {
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

  it(
    "full tool set: simple read doesn't trigger writes",
    runScenarioTest({
      prompt:
        "What's on the homepage? Just show me what content it has.",
      tools: allTools,
      requiredTools: ["get-page"],
      successPattern: /home|content|field|value|page/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "full tool set: block summary guides to inspect-blocks",
    runScenarioTest({
      prompt:
        "Get the homepage details, and if there are any blocks on it, show me what's inside them.",
      tools: allTools,
      requiredTools: ["get-page", "inspect-blocks"],
      successPattern: /block|content|property|inspect/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "full tool set: site structure uses list-children not search",
    runScenarioTest({
      prompt:
        "Give me the full site tree — all pages and their children.",
      tools: allTools,
      requiredTools: ["list-children"],
      successPattern: /page|site|tree|structure|child/i,
      verbose: true,
    }),
    timeout
  );
});
