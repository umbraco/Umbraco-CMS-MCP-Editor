# "Can I Safely Delete This?" Check

## The Editor's Problem

An editor wants to remove an old page or media item but is afraid of breaking something. "Is anything linking to this? Will I create broken links?" In the UI, you'd need to:
1. Open the page
2. Go to the Info tab
3. Check "Referenced by" 
4. For media: also check which pages use the image
5. For a page with children: check if any of the descendants are referenced

This takes multiple clicks across multiple screens, and for a page tree with children you'd need to check every descendant individually.

## What This Enables

**"Can I delete the 'Old Events' section?"** — The LLM checks the page AND all its descendants for inbound references, media usage, redirects, and internal links. It reports back: "The 'Summer 2024' page under Old Events is still linked from the homepage hero banner. You should update that link before deleting."

**"What would break if I trash this image?"** — Check all pages that reference a media item before deleting it.

## API Endpoints Used

- `GET /document/{id}/referenced-by` — who links to this page
- `GET /document/{id}/referenced-descendants` — which descendants are referenced by other content
- `GET /media/{id}/referenced-by` — which pages use this media
- `GET /media/{id}/referenced-descendants` — which media descendants are in use
- `GET /document/are-referenced` — bulk check if multiple documents are referenced
- `GET /recycle-bin/document/referenced-by` — even check references to trashed content

## Proposed Tool: `check-safe-to-delete`

**Input:**
- `id` (uuid) — content or media item ID
- `type` (enum: "content" | "media", default "content")

**Output:**
- Safe to delete: yes/no/warning
- References found: list of pages/media that link to this item
- Descendant references: list of child items that are referenced elsewhere
- Suggested actions: "Update the link on 'Homepage' before deleting" or "No references found — safe to delete"

## Why This Goes Beyond the UI

The UI shows references for one item at a time, on its Info tab. It doesn't check descendants. An editor managing a section with 50 child pages would need to open each one individually to check. The LLM does this in one call, walks the entire subtree, and gives a clear go/no-go answer.

This is particularly valuable when restructuring a site — "I want to reorganize the entire Products section. Which pages can I safely move or delete?"

## Editor Story

> "I need to remove the old 'COVID Updates' section from the site. It has 30 pages underneath it. Can you check if anything still links to any of those pages before I trash the whole thing?"

The LLM checks all 30 pages, finds that 2 are still linked from the Resources page, tells the editor exactly which ones, and offers to update those links before proceeding.
