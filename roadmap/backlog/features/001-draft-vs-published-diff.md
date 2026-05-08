# Draft vs Published Diff

## The Insight

The API has two separate endpoints: `GET /document/{id}` returns the current working draft, and `GET /document/{id}/published` returns the live published version. The UI shows one or the other — it never shows you the **difference** between them.

An LLM can compare both versions and tell an editor exactly what has changed since the last publish, across every property, in natural language.

## What This Enables

**"What's changed since I last published?"** — An editor working on a page over several days can lose track of what they've modified. Instead of manually remembering or clicking through version history, the LLM fetches both versions, diffs them, and presents a clear summary.

**"Is it safe to publish?"** — Before publishing, an editor wants confidence about what's going live. The diff tool shows exactly what will change on the live site.

**"Show me all pages with unpublished changes"** — Combine with `report-unpublished` to find pages with pending drafts, then diff each one to show a summary of all pending changes across the site.

## API Endpoints Used

- `GET /document/{id}` — current draft
- `GET /document/{id}/published` — live published version
- Our existing `get-page` tool (wraps draft)
- Our existing `get-publish-status` tool

## Proposed Tool: `compare-draft-to-published`

**Input:**
- `id` (uuid) — page ID

**Output:**
- Page name, document type
- Publish status (published, draft, scheduled)
- Per-property diff: property alias, draft value, published value, change type (added/modified/removed)
- Summary: "3 properties changed: title, mainContent, heroImage"

## Why This Goes Beyond the UI

The UI shows you the current state OR the published state. To compare, you'd need to open the page, look at the published preview in another tab, and manually spot differences across every property and tab. For pages with 20+ properties across multiple tabs, this is tedious and error-prone.

The LLM does this comparison instantly and can describe changes in plain language: "The title changed from 'Welcome' to 'Welcome Home', and a new paragraph was added to the main content."

## Compound Scenarios

- **Site-wide publish readiness**: "Show me all unpublished changes across the site" — combines report-unpublished + compare-draft-to-published for each page
- **Pre-publish review**: "What will change on the live site if I publish the homepage?" — natural editorial question
- **Change tracking**: "What has the content team changed this week?" — combine with audit log + diff
