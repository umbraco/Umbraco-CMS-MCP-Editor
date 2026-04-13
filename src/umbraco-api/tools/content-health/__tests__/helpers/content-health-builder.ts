/**
 * Content Health Builder — thin re-export of ContentBuilder.
 *
 * The content-health collection audits existing content rather than creating
 * its own entity types, so this builder re-uses the ContentBuilder from the
 * content collection to create auditable test pages.
 */

export { ContentBuilder as ContentHealthBuilder } from "../../../content/__tests__/helpers/content-builder.js";
