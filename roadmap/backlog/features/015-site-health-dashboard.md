# Site Health Dashboard

## The Editor's Problem

Editors are responsible for their site's content quality but have no single view of overall health. To understand the state of their site, they'd need to:
- Check how many pages are published vs draft
- Look for stale content
- Check SEO coverage
- Verify accessibility compliance
- Review the content tree structure
- Check media library health
- Review translation coverage

Each of these requires navigating to different sections, running different reports, and mentally combining the results.

## What This Enables

**"How healthy is our website content?"** — A single command that produces a comprehensive health score across all dimensions.

**"What should I work on today?"** — The LLM prioritises editorial tasks based on site health metrics.

**"Show me the executive summary for our content team meeting"** — A report suitable for sharing with stakeholders.

## How It Works (Orchestrating Existing Tools)

The LLM runs multiple tools and synthesises the results:

1. `report-site-tree-summary` — structure overview
2. `report-unpublished` — draft content waiting
3. `report-stale-content` — outdated pages
4. `report-empty-fields` — incomplete content
5. `report-short-content` — thin content
6. `report-media-missing-alt` — accessibility gaps
7. `report-unused-media` — media waste
8. `report-large-media` — performance risks
9. `report-translation-coverage` — multilingual gaps
10. `report-orphan-pages` — structural issues
11. `report-deep-pages` — navigation depth problems

**Output: An editorial health report:**
```
Site Health Report — April 2026

Overall Score: 72/100

Content (34 pages)
  Published: 28 | Draft: 4 | Stale (90+ days): 6
  Empty fields: 12 across 8 pages
  Short content (<100 words): 3 pages

SEO
  Pages with meta description: 24/34 (71%)
  Pages with meta title: 30/34 (88%)

Accessibility  
  Images missing alt text: 23/145 (16%)

Media Library (145 items)
  Unused: 34 items (estimated 45MB)
  Oversized (>5MB): 8 items

Translation (if multilingual)
  English: 100% | French: 78% | German: 45%

Top Priorities:
1. Add alt text to 23 images (accessibility compliance)
2. Review 6 stale pages not updated in 90+ days
3. Complete SEO fields on 10 pages
4. Publish or delete 4 draft pages
```

## Why This Goes Beyond the UI

There is no health dashboard in Umbraco. Each metric lives in a different section or requires a separate report. The LLM combines them into a single narrative with clear priorities. It can track health over time ("Your SEO coverage improved from 71% to 88% since last month") and suggest the highest-impact actions.

## Editor Story

> "I'm presenting to the marketing director next week. Can you give me a content health summary?"

The LLM runs the full health check and produces a clean report showing progress, issues, and recommended next steps — ready to share.
