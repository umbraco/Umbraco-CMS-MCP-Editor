/**
 * Content Reporting Builder
 *
 * This collection is read-only — all tools are reports that scan existing
 * content. No dedicated builder is required. Re-export ContentBuilder so
 * tests that need to seed content for reporting can use a consistent import
 * path within this collection.
 */

export {
  ContentBuilder as ContentReportingBuilder,
} from "../../../content/__tests__/helpers/content-builder.js";
