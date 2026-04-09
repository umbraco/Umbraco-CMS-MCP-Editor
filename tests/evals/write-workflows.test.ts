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
  "report-deep-pages",
  // Media Health
  "report-large-media",
  // Relationships
  "report-content-references",
  "report-orphan-pages",
  "report-unused-media",
  "report-outbound-links",
  "report-most-referenced",
  "report-relationship-map",
  "report-external-links",
  // Bulk Operations
  "bulk-publish",
  "bulk-unpublish",
  "bulk-schedule-publish",
  "bulk-set-property",
  "bulk-move",
  "bulk-set-block-property",
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
