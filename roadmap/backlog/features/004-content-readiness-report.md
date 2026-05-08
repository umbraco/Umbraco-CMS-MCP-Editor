# Content Readiness Report

## The Editor's Problem

Before a site launch, campaign go-live, or major publish, an editor needs to answer: "Is everything ready?" This means checking across dozens of pages that:
- All required fields are filled in
- Images have alt text (accessibility)
- SEO fields are populated (meta title, meta description)
- No pages are accidentally left in draft
- No broken internal links exist
- Content meets minimum quality thresholds

In the UI, this means opening every single page, checking every tab, then going to Settings to verify SEO fields, then checking media for alt text. For a 50-page campaign section, this could take hours.

## What This Enables

**"Is the new product section ready to go live?"** — Point the LLM at a content section and it runs a comprehensive readiness check across all pages in that branch.

**"Run a pre-launch checklist on the whole site"** — Automated quality gate that checks everything an editor would manually check, but across the entire site in seconds.

## How It Works (Multi-Tool Orchestration)

The LLM already has all the individual tools — this is about combining them intelligently:

1. `list-children` — get all pages in the target section
2. `get-page` — read each page's content
3. `get-publish-status` — check publish state
4. `audit-page-content` — check content quality
5. `audit-page-seo` — check SEO readiness
6. `report-empty-fields` — find missing content
7. `report-media-missing-alt` — check accessibility
8. `inspect-blocks` — verify block content is complete

**Output: A single, prioritised report:**
```
Section: Products (12 pages)

Ready to publish: 8 pages
Needs attention: 4 pages

Issues found:
- "Widget Pro" — missing SEO meta description
- "Widget Pro" — hero image has no alt text  
- "Accessories" — page is still in draft, never published
- "Pricing" — 'callToAction' field is empty
- "Pricing" — content body is under 100 words (may look thin)

Recommendation: Fix 4 issues above, then bulk-publish all 12 pages.
```

## Proposed Tool: `report-content-readiness`

**Input:**
- `parentId` (uuid, optional) — check a specific section, or omit for whole site
- `checks` (array, optional) — which checks to run: "seo", "accessibility", "completeness", "publishStatus"

**Output:**
- Summary counts: ready, needs-attention, critical
- Per-page issues with severity and suggested fix
- Overall readiness score

## Why This Goes Beyond the UI

The UI has no concept of a "readiness report." An editor checks one page at a time, one concern at a time. There's no cross-page view that aggregates quality issues. Our existing audit tools (`audit-page-seo`, `audit-page-content`, `report-empty-fields`) each cover one dimension — this tool orchestrates them all into a single editorial workflow.

## Editor Story

> "We're launching the new Services section on Monday. There are 15 pages. Can you check everything is ready?"

The LLM runs the readiness report, finds 3 pages with SEO gaps and 1 with a missing hero image, fixes the SEO fields itself, and tells the editor to upload the hero image. Then bulk-publishes the rest.
