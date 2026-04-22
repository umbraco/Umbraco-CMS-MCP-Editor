# Media Usage / References Report

## Problem

The Umbraco UI shows a **"Referenced by"** section on the Info tab of media items. This shows which content pages use a given media item. For example, the "Bluetooth white keyboard" image shows it's referenced by Home, Draft, Features, and Contact pages.

Our existing `report-unused-media` tool reports media items with **zero** references, but there's no way to:
- See which pages use a specific media item
- Get the full reference list for a media item
- Understand media dependencies before deleting or replacing

## UI Workflow (Reproduction Steps)

1. Navigate to Media section
2. Open any media item (e.g. Sample Images > Bluetooth white keyboard)
3. Click the **"Info"** tab
4. The **"Referenced by"** section lists all content pages using this media item, with their status (Draft, Published)

## Proposed Tool: `get-media-references`

**Input:**
- `id` (uuid) — media item ID

**Output:**
- List of referencing content pages: ID, name, status (Draft/Published), document type
- Total reference count

**Why this matters:**
- Essential before replacing or deleting media: "Show me what pages use this image before I delete it"
- Enables smart media cleanup: "Find all pages using the old logo and update them"
- Pairs well with existing `report-unused-media` for full media audit workflows
- The data is already in Umbraco's relation system — just needs exposing

## Alternative: Enhance `get-media`

Instead of a separate tool, we could add a `references` field to the `get-media` output. This would make reference data available every time a media item is retrieved.

## Impact

Medium — particularly valuable for media management and cleanup tasks.
