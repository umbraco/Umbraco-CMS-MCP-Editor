/**
 * Member Workflow Eval Tests
 *
 * These tests cover member search, profile viewing, creation, group listing,
 * member count reporting, and activity reporting.
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
  "list-page-templates",
  "set-page-template",
  "delete-page",
  "restore-page",
  // Publishing
  "publish-page",
  "unpublish-page",
  // Versioning
  "list-versions",
  "rollback-page",
  "get-page-change-history",
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
  "bulk-move-media",
  "get-media-change-history",
  // Recycle Bin
  "list-recycle-bin",
  "permanent-delete-recycle-bin-item",
  "empty-recycle-bin",
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
  // DISABLED (tree walk, scanLimit=100): "report-empty-fields", "report-short-content", "report-media-missing-alt"
  // Content Reporting — DISABLED at collection level (tree walk, scanLimit=100–500):
  // "report-stale-content", "report-unpublished", "report-recently-changed",
  // "report-content-by-type", "report-translation-coverage"
  // Site Structure
  "report-site-tree-summary",
  "report-deep-pages",
  // Media Health — DISABLED at collection level (tree walk, scanLimit=100): "report-large-media"
  // Relationships
  "report-content-references",
  // DISABLED (tree walk, scanLimit=100): "report-orphan-pages"
  "report-outbound-links",
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
  // Scheduling — DISABLED (tree walk, scanLimit=100): "list-scheduled-content"
  "get-publish-status",
  "schedule-publish",
  "cancel-schedule",
  // Redirects
  "list-redirects",
  "get-redirect",
  "delete-redirect",
  "get-redirect-status",
  // Public Access
  "get-public-access",
  "set-public-access",
  "remove-public-access",
  // Notifications (hosted-only — exposed in evals for coverage)
  "get-content-notifications",
  "set-content-notifications",
];

describe("Member Workflows", () => {
  setupConsoleMock();

  const timeout = getDefaultTimeoutMs();

  it(
    "find a member",
    runScenarioTest({
      prompt:
        "Use search-members to search for members matching 'admin' or 'test'.",
      tools: ["search-members", "get-member"],
      requiredTools: ["search-members"],
      successPattern: /member|search|found|admin|test/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "view member profile",
    runScenarioTest({
      prompt:
        "Use search-members to find a member matching 'member'. If a result is found, use get-member to show their full profile details. If no members exist, report that the member list is empty.",
      tools: allTools,
      requiredTools: ["search-members"],
      successPattern: /member|profile|email|group|empty|no member/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "create member",
    runScenarioTest({
      prompt:
        "Use list-member-types to find a valid member type, then use create-member to create a test member with email eval-test@example.com.",
      tools: allTools,
      requiredTools: ["create-member"],
      successPattern: /member|created|confirm/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "member count",
    runScenarioTest({
      prompt:
        "Use report-member-count to show a breakdown of members by type and group.",
      tools: ["report-member-count", "list-member-groups"],
      requiredTools: ["report-member-count"],
      successPattern: /member|count|type|group|total/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "inactive members",
    runScenarioTest({
      prompt:
        "Use report-member-activity with a 90 day threshold to find inactive members.",
      tools: ["report-member-activity"],
      requiredTools: ["report-member-activity"],
      successPattern: /member|inactive|activity|login|day/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "list groups",
    runScenarioTest({
      prompt: "What member groups are available?",
      tools: ["list-member-groups"],
      requiredTools: ["list-member-groups"],
      successPattern: /group|member/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "public access create, read, remove",
    runScenarioTest({
      prompt:
        "Pick the first root-level content page (use list-children with no parentId). " +
        "First use get-public-access to report whether it has restrictions. " +
        "Then use list-member-groups to find an existing member group — if none exist, use create-member-group to make one called 'Eval Test Group'. " +
        "Then use set-public-access to restrict the page to that group, using the same page as both login and error page. " +
        "Then use get-public-access to confirm the restriction was applied. " +
        "Finally use remove-public-access to clear the restriction.",
      tools: allTools,
      requiredTools: [
        "list-children",
        "list-member-groups",
        "set-public-access",
        "get-public-access",
        "remove-public-access",
      ],
      successPattern: /public access|restriction|group|removed|set|cleared/i,
      verbose: true,
    }),
    timeout
  );

  it(
    "unlock member and reset password",
    runScenarioTest({
      prompt:
        "A member named 'eval' is locked out and forgot their password. Find them with search-members, then use update-member to unlock the account and set a temporary password of 'TempPass123!'. They'll change it on next login.",
      tools: allTools,
      requiredTools: ["search-members", "update-member"],
      successPattern: /unlock|password|reset|updated|temporary/i,
      verbose: true,
    }),
    timeout
  );
});
