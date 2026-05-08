/**
 * Media Health Builder — thin re-export of MediaBuilder.
 *
 * The media-health collection audits existing media rather than creating
 * its own entity types, so this builder re-uses the media collection's builder.
 */

export { MediaBuilder as MediaHealthBuilder } from "../../../media/__tests__/helpers/media-builder.js";
