# Duplicate Content (Copy To)

## Problem

The Umbraco UI has a **"Duplicate to..."** entity action on content nodes that allows editors to copy a page (and optionally its children) to another location in the content tree. This is a common editorial workflow for:
- Creating similar pages based on existing content
- Duplicating a page template to a different section
- Creating seasonal/campaign variants of existing pages

We have **no equivalent tool** for this operation.

## UI Workflow (Reproduction Steps)

1. Navigate to Content section
2. Open any content node (e.g. Home)
3. Click the **"..."** (entity actions menu) in the workspace header
4. Select **"Duplicate to..."**
5. A tree picker dialog appears to choose the destination
6. Optionally choose to include child nodes
7. The page (and children if selected) are duplicated to the new location

## Proposed Tool: `duplicate-page`

**Input:**
- `id` (uuid) — page ID to duplicate
- `targetParentId` (uuid, optional) — destination parent node (null for root)
- `includeDescendants` (boolean, optional) — also duplicate child pages

**Behaviour:**
1. Fetch source page details for confirmation
2. Confirm: "Duplicate 'Page Name' to 'Target Name'?"
3. Call the CMS copy-document endpoint
4. Return the new page's ID and name

**Why this matters:**
- Very common editorial workflow with no MCP equivalent
- Without this, an LLM would need to: read the source page, create a new page, copy every property value individually — extremely tedious and error-prone for complex document types with blocks
- Particularly valuable for sites with many similar pages (product listings, event pages, articles)

## Impact

Medium-High — frequent editorial operation, especially on content-heavy sites.
