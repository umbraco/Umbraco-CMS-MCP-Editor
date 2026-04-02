/**
 * Write Workflow Eval Tests
 *
 * These tests mutate shared content (the homepage) so they MUST run
 * sequentially. The Jest config uses --runInBand for this file.
 *
 * Write operations use elicitation which is auto-accepted by the eval runner.
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

describe("Write Workflows", () => {
  setupConsoleMock();

  const timeout = getDefaultTimeoutMs();

  it(
    "editor asks to publish a page",
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
    "editor asks to update content on a page",
    runScenarioTest({
      prompt:
        "Find the homepage and use edit-page to set its heroHeader field to 'Explore Our World'. Always make the edit even if the value appears unchanged.",
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
    "editor asks to change a value inside a block",
    runScenarioTest({
      prompt:
        "I need you to set the pageSize to 7 in the contentRows block on the homepage. Use inspect-blocks to find the block, then use edit-block to set the value. Always make the edit even if the value appears unchanged.",
      tools: [
        "search-content",
        "get-page",
        "list-children",
        "inspect-blocks",
        "edit-block",
      ],
      requiredTools: ["inspect-blocks", "edit-block"],
      successPattern: /update|edit|block|saved|changed|pageSize/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "full tool set: multi-step edit and publish",
    runScenarioTest({
      prompt:
        "Find the homepage, use inspect-blocks on the contentRows property, then use edit-block to set showPagination to true, then publish the page. Always make the edit even if the value appears unchanged.",
      tools: allTools,
      requiredTools: ["inspect-blocks", "edit-block", "publish-page"],
      successPattern: /publish|updated|block|live/i,
      verbose: true,
    }),
    timeout
  );
});
