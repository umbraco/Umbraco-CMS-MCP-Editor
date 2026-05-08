# Quality of Life Tools — Summary Index

These are friction-reduction tools. Each one eliminates clicks, page loads, and context switches that editors deal with daily. Individually small. Collectively transformative.

## The Pattern

Every one of these follows the same pattern: **something that takes 4-15 clicks in the UI becomes one sentence in conversation.**

| # | Tool | UI Clicks Saved | Core Friction |
|---|------|----------------|---------------|
| 001 | `rename-page` | 4 per page | Full page load just to change a name |
| 002 | `copy-property` | 8+ per copy | Can't copy media pickers or blocks between pages |
| 003 | `where-is-this-used` | 4+ per item | Must navigate to Info tab, no context about HOW it's used |
| 004 | `report-publish-overview` | 3+ per page | No section-level status view |
| 005 | `reorder-blocks` / `move-block` | Many drags | Can't move blocks between pages at all |
| 006 | `set-property-in-section` | 4+ per page × N | No way to set a value across a section |
| 007 | `peek-page` | Full page load | Every check requires loading the full editor |
| 008 | `publish-section` | 3+ per page | "Publish with descendants" is all-or-nothing |
| 009 | Page paths in output | 2+ per lookup | Search results don't show where pages are |
| 010 | `toggle-page-flag` | 4+ per toggle | Full page load to flip a boolean |
| 011 | `whats-changed` | Many clicks | No "recent changes" summary |
| 012 | `move-page` | 5+ clicks | Must use bulk tool or UI tree picker |
| 013 | `list-pages-by-type` | 3+ clicks to dashboard | No quick "show all articles" |
| 014 | `clear-property` | Varies | Different clearing UX per property type |
| 015 | `compare-pages` | 2 tabs + manual scanning | No page comparison feature |
| 016 | `count-descendants` | Expand + count | No count shown anywhere |
| 017 | `find-pages-by-value` | Open every page | Cannot filter by property value |

## Highest Impact (implement first)

1. **`rename-page`** — absurdly common, absurdly tedious
2. **`toggle-page-flag`** — full page load for a boolean is painful
3. **`move-page`** — simple obvious operation missing from tools
4. **`find-pages-by-value`** — impossible in UI, immediately useful
5. **`set-property-in-section`** — multiplier on bulk-set-property
6. **`peek-page`** — eliminates the most common micro-wait
7. **`whats-changed`** — every editor asks this, no answer exists
8. **Page paths in existing tool output** — not a new tool, just better output

## What These Have in Common

None of these are complex. They're not orchestrating 10 tools or doing AI analysis. They're **removing unnecessary page loads and clicks from simple operations**. That's what makes them QoL — they respect the editor's time for the small stuff.
