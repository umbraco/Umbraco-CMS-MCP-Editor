# Content Calendar and Publishing Plan

## The Editor's Problem

Editors plan content across time — blog posts every Tuesday, product launches on specific dates, seasonal campaigns, scheduled publishes. In the UI, scheduling is per-page (set a future publish date on one page). There's no calendar view showing what's scheduled, what was recently published, and what's coming up.

Our `list-scheduled-content` tool shows what's queued, but there's no broader editorial calendar view.

## What This Enables

**"What's our publishing schedule this week?"** — Show recently published, currently scheduled, and upcoming content.

**"We need a blog post every Tuesday. What's the status?"** — Check if the pattern is being maintained by looking at publish dates.

**"When was each page in this section last published?"** — Useful for editorial planning — know what's fresh and what's stale.

**"Schedule these 5 blog posts to publish daily next week"** — Bulk schedule with staggered dates.

## How It Works

1. `list-scheduled-content` — future scheduled publishes
2. `report-recently-changed` — recent activity
3. `get-page` + audit log — per-page publish history
4. `schedule-publish` — set future publish dates
5. LLM reasoning — build a calendar view, identify gaps in the schedule

## Proposed Tool: `report-publishing-timeline`

**Input:**
- `parentId` (uuid, optional) — scope to a section
- `daysBack` (number, default 30) — how far back to look
- `daysForward` (number, default 30) — how far forward to look

**Output:**
- Recently published: page name, publish date, publisher
- Scheduled: page name, scheduled date
- Timeline view (text-based)
- Gaps: "No publishes scheduled between April 15-22"

## Why This Goes Beyond the UI

The UI has no calendar or timeline view. Scheduled content is just a list. Recent activity is buried in the audit log. The LLM can synthesise publish history and schedule data into a coherent editorial timeline.

## Editor Story

> "Show me what we've published in the last 2 weeks and what's coming up."

The LLM produces: "Last 2 weeks: 8 pages published (3 blog posts, 2 product updates, 3 page edits). Coming up: 2 blog posts scheduled for next Tuesday and Thursday. Gap: nothing scheduled after Thursday — you might want to plan content for the following week."
