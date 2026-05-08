# Content Expiry and Lifecycle Manager

## The Editor's Problem

Content goes stale. Job postings expire. Events pass. Promotions end. Seasonal content becomes irrelevant. In the UI, an editor has to manually remember to:
- Unpublish expired content
- Update seasonal references
- Check if time-sensitive content is still relevant
- Schedule future unpublish dates

The scheduling tools can set a future publish, but there's no easy way to find all content that's past its relevant date, or to scan properties for dates/references that suggest content is time-sensitive.

## What This Enables

**"Find all content that mentions dates in the past"** — The LLM scans content properties for date references (event dates, offer end dates, "valid until" text) and flags pages where those dates have passed.

**"What content should be reviewed for the new quarter?"** — Combine stale content detection with date scanning to produce an editorial review list.

**"Unpublish all events that happened more than a month ago"** — Find expired events by scanning date properties, confirm with editor, then bulk-unpublish.

## How It Works

1. `report-stale-content` — find content not updated in X days
2. `search-content` / `get-page` — scan pages for date-related properties
3. LLM reasoning — identify dates in content that are in the past, spot text like "ends December 2025", "valid through Q1"
4. Cross-reference with publish status — are expired pages still live?
5. Present editorial action list with recommendations

## Why This Goes Beyond the UI

The UI has no content lifecycle view. `report-stale-content` finds pages not recently edited, but that's just last-modified date. It doesn't understand that a page about "Summer Sale 2025" is stale because summer 2025 is over, even if someone edited it last week.

The LLM can read content semantically — it understands that "Offer ends March 31st" means the page is irrelevant after March 31st. No UI can do this kind of natural language reasoning about content freshness.

## Combining With Schedule Tools

- Find expired content → suggest bulk-unpublish
- Find upcoming expiry → set up scheduled unpublish using `schedule-publish`
- Find seasonal content → remind editors to update before the next season

## Editor Story

> "It's January. Can you check if we have any content that still references Christmas or holiday promotions that should come down?"

The LLM scans the site, finds 8 pages with Christmas/holiday references (some in page titles, some in body content, some in promotional banners), and offers to unpublish the time-bound ones while flagging the evergreen ones for a text update.
