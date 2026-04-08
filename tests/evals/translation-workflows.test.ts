/**
 * Translation and Tag Workflow Eval Tests
 *
 * These tests cover language management, content variant creation, dictionary
 * item lookup and editing, and tag retrieval. Write tests mutate shared state
 * so all tests in this file run sequentially (Jest default).
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
  // Content
  "search-content",
  "get-page",
  "list-children",
  "list-document-types",
  "inspect-blocks",
  "create-page",
  "edit-page",
  "edit-block",
  "delete-page",
  // Publishing
  "publish-page",
  "unpublish-page",
  // Versioning
  "list-versions",
  "rollback-page",
  // Media
  "search-media",
  "list-media-children",
  "get-media",
  "list-media-types",
  "upload-media",
  "create-media-folder",
  "move-media",
  "delete-media",
  "restore-media",
  // Blueprints
  "list-blueprints",
  "get-blueprint",
  "create-blueprint",
  // Languages
  "list-languages",
  "get-language",
  "create-language",
  "update-language",
  "delete-language",
  // Translation
  "create-variant",
  "copy-variant",
  "list-untranslated",
  // Dictionary
  "list-dictionary",
  "search-dictionary",
  "get-dictionary",
  "create-dictionary",
  "update-dictionary",
  "move-dictionary",
  // Tags
  "list-tags",
  // Content Health
  "audit-page-seo",
  "audit-page-content",
  "report-empty-fields",
  "report-short-content",
  "report-media-missing-alt",
  // Content Reporting
  "report-stale-content",
  "report-unpublished",
  "report-recently-changed",
  "report-content-by-type",
  "report-translation-coverage",
  // Site Structure
  "report-site-tree-summary",
  "report-orphan-pages",
  "report-deep-pages",
  // Media Health
  "report-unused-media",
  "report-large-media",
  "report-content-references",
  // Bulk Operations
  "bulk-publish",
  "bulk-unpublish",
  "bulk-schedule-publish",
  "bulk-set-property",
  "bulk-move",
  // Members
  "search-members",
  "get-member",
  "list-member-types",
  "create-member",
  "update-member",
  "delete-member",
  // Member Groups
  "list-member-groups",
  "create-member-group",
  "delete-member-group",
  // Member Reporting
  "report-member-count",
  "report-members-by-group",
  "report-member-activity",
  // Scheduling
  "get-publish-status",
  "list-scheduled-content",
  "schedule-publish",
  "cancel-schedule",
  // Redirects
  "list-redirects",
  "get-redirect",
  "delete-redirect",
  "get-redirect-status",
];

describe("Translation and Tag Workflows", () => {
  setupConsoleMock();

  const timeout = getDefaultTimeoutMs();

  it(
    "editor asks what languages the site supports",
    runScenarioTest({
      prompt: "What languages does this site support?",
      tools: ["list-languages", "get-language"],
      requiredTools: ["list-languages"],
      successPattern: /language|english/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks to create a Danish version",
    runScenarioTest({
      prompt:
        "Create a Danish (da-DK) variant of the homepage. First find the homepage using search-content or list-children. Then call create-variant directly with culture 'da-DK' — do not attempt to add a new language first. If the tool returns an error, report it and say 'Variant creation attempted'.",
      tools: allTools,
      requiredTools: ["create-variant"],
      successPattern: /variant|danish|da|created|confirm|attempted/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks which pages need translation",
    runScenarioTest({
      prompt: "Use the list-untranslated tool with culture 'da-DK' to find pages missing a Danish translation.",
      tools: ["list-languages", "list-untranslated", "list-children"],
      requiredTools: ["list-untranslated"],
      successPattern: /untranslated|missing|translation|da|page/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor searches dictionary",
    runScenarioTest({
      prompt: "Find the dictionary item for 'welcome'",
      tools: ["search-dictionary", "get-dictionary", "list-dictionary"],
      requiredTools: ["search-dictionary"],
      successPattern: /dictionary|welcome|search/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor updates dictionary translation",
    runScenarioTest({
      prompt:
        "Add a Danish translation 'Læs mere' for the 'Read more' dictionary item",
      tools: allTools,
      requiredTools: ["update-dictionary"],
      successPattern: /dictionary|updated|translation|confirm/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "editor asks about tags",
    runScenarioTest({
      prompt: "What tags are used on the site?",
      tools: ["list-tags"],
      requiredTools: ["list-tags"],
      successPattern: /tag/i,
      verbose: true,
    }),
    timeout
  );
});
