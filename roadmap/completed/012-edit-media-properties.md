# Edit Media Properties (Alt Text)

> **Status:** ✅ Completed — shipped as the `edit-media` tool in the `media-management` collection (PR #10). Pairs with `get-media-type` for alias discovery.

## Problem

The Umbraco UI media editor shows editable properties on media items. For images, the **Details** tab shows:
- **Image** — file upload/replace
- **Width** / **Height** (read-only, auto-detected)
- **File size** / **File extension** (read-only)
- **Alt Text** — editable text field describing the image

While we have `upload-media` for uploading new files, we have **no tool to edit media properties** like alt text. Our `report-media-missing-alt` tool can find images without alt text, but can't fix them.

## UI Workflow (Reproduction Steps)

1. Navigate to Media section
2. Open any image (e.g. Sample Images > Bluetooth white keyboard)
3. The **"Details"** tab shows image properties
4. Edit the **"Alt Text"** field
5. Click **Save**

## Proposed Tool: `edit-media`

**Input:**
- `id` (uuid) — media item ID
- `name` (string, optional) — rename the media item
- `values` (array of { alias, value }, optional) — property values to update

**Common property aliases:**
- `umbracoAlt` — alt text for images
- `umbracoCaption` — caption text (if available on media type)

**Behaviour:**
1. Fetch media item for confirmation
2. Confirm: "Update alt text on 'Image Name'?"
3. Save the property changes

**Why this matters:**
- Closes the loop on `report-media-missing-alt`: find images missing alt text, then fix them
- Alt text is critical for accessibility and SEO
- An LLM could auto-generate alt text descriptions and apply them in bulk
- Combined with bulk operations: "Add alt text to all 50 images in the Sample Images folder"

## Potential Bulk Tool: `bulk-set-media-alt`

A specialized bulk tool that sets alt text on multiple images at once. The LLM could:
1. List images in a folder
2. Generate alt text descriptions for each
3. Apply them all in one bulk operation

## Impact

High — accessibility compliance and SEO are major editorial concerns. The ability to bulk-fix alt text is highly valuable.
