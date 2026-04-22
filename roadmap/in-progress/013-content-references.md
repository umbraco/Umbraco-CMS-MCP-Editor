# Content References (Inbound)

## Problem

The Umbraco UI shows a **"Referenced by"** section on the Info tab of content pages. This shows other content pages that link to or reference the current page (via content pickers, etc.).

We have `report-content-references` which shows **outbound** references (what a page links to), and `report-outbound-links` for external links. But we may be missing **inbound** references — "what pages link TO this page?"

## UI Workflow (Reproduction Steps)

1. Navigate to Content section
2. Open any content node
3. Click the **"Info"** tab
4. The **"Referenced by"** section shows pages that reference this content
5. If empty: "This item has no references."

## Assessment

Need to verify: does our `report-content-references` tool return inbound references, outbound references, or both? If it only shows outbound, we need an inbound reference tool.

**Inbound references are critical for:**
- "Can I safely delete this page?" — check if anything references it
- "What pages link to the About page?" — content audit
- Understanding content dependencies before restructuring

## Proposed Tool (if needed): `get-inbound-references`

**Input:** `id` (uuid) — content page ID  
**Output:** List of pages that reference this content: ID, name, status, document type

## Impact

Medium — important for safe content management and restructuring.
