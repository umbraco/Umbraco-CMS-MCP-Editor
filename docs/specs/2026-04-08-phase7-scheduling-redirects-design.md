# Phase 7: Scheduling & Redirects — Design Spec

## Overview

Add scheduled publishing management and URL redirect management to the editor MCP. Two new collections, 8 new tools. This is the final phase.

## Collections

### `scheduling` (4 tools)

Manage scheduled publishing — view status, list pending schedules, schedule/cancel.

| Tool | Purpose | CMS delegation | Slices | Elicitation |
|------|---------|---------------|--------|-------------|
| `get-publish-status` | View a page's publish state and scheduled dates | `get-document-publish` | `read` | no |
| `list-scheduled-content` | Find pages with future scheduled publish/unpublish dates | adaptive: search + tree walk + `get-document-publish` | `read` | no |
| `schedule-publish` | Schedule a page to publish at a future date | `publish-document` with publishSchedules | `publish` | yes, default checked |
| `cancel-schedule` | Cancel a pending scheduled publish | `publish-document` with empty schedules | `publish` | yes, default checked |

### `redirect` (4 tools)

Manage URL redirects — view, list, delete, check tracking status.

| Tool | Purpose | CMS delegation | Slices | Elicitation |
|------|---------|---------------|--------|-------------|
| `list-redirects` | List all URL redirects | `get-all-redirects` | `list` | no |
| `get-redirect` | View redirect details | `get-redirect-by-id` | `read` | no |
| `delete-redirect` | Delete a redirect | `delete-redirect` | `delete` | yes, destructive, default unchecked |
| `get-redirect-status` | Check if URL redirect tracking is enabled | `get-redirect-status` | `read` | no |

Note: toggling redirect tracking on/off is excluded — that's a developer concern. The read-only status check helps editors understand whether redirects are being tracked.

## Tool Design Details

### Scheduling tools

**`get-publish-status`**
- Input: `id` (uuid)
- Output: `{ id, name, isPublished, publishDate, scheduledPublishDate, scheduledUnpublishDate, state, variants }`
- Delegates to `get-document-publish`. Extracts variant-level scheduling info.
- Description: "View a page's current publish state including any scheduled publish or unpublish dates. Shows per-variant status for multilingual sites."

**`list-scheduled-content`**
- Input: optional `parentId` (uuid), `take` (default 50), `skip` (default 0)
- Output: `{ items: [{ id, name, url, scheduledPublishDate, scheduledUnpublishDate, culture }], total, scannedPages }`
- Scans direct children of `parentId` (or root if omitted). For each page, calls `get-document-publish` and checks for non-null `scheduledPublishDate` or `scheduledUnpublishDate` in any variant. Returns only pages with pending schedules. Note: `get-document-publish` returns 404 for unpublished pages — these are silently skipped.
- Description: "Find pages with pending scheduled publish or unpublish dates. Scans direct children of a parent (or root). Use parentId to check specific sections of the site."

**`schedule-publish`**
- Input: `id` (uuid), `publishDate` (string, ISO 8601 datetime), `culture` (string, optional — for variant-specific scheduling)
- Output: `{ message, id, name, scheduledDate }`
- Fetch page name for confirmation
- Elicitation: "Schedule '{pageName}' to publish on {publishDate}?"
- Delegate to: `publish-document` with `publishSchedules: [{ culture: culture ?? null, schedule: publishDate }]`
- Description: "Schedule a page to publish at a future date. Provide the date in ISO 8601 format. Must be in the future. Optionally specify a culture for variant-specific scheduling. You will be asked to confirm."

**`cancel-schedule`**
- Input: `id` (uuid), `culture` (string, optional)
- Output: `{ message, id, name }`
- Fetch page publish status first to verify there's a schedule to cancel and get the page name
- Elicitation: "Cancel the scheduled publish for '{pageName}'?"
- Delegate to: `publish-document` with `publishSchedules: []` (empty schedules clears them)
- Description: "Cancel a pending scheduled publish for a page. Use get-publish-status to verify the page has a pending schedule. You will be asked to confirm."

### Redirect tools

**`list-redirects`**
- Input: `take` (default 50), `skip` (default 0), `filter` (string, optional — filter by URL)
- Output: `{ items: [{ id, originalUrl, destinationUrl, destinationType, isAutomatic }], total }`
- Delegate to: `get-all-redirects`
- Description: "List URL redirects configured on the site. Optionally filter by URL. Shows the original URL, destination, and whether the redirect was created automatically by Umbraco."

**`get-redirect`**
- Input: `id` (uuid)
- Output: `{ id, originalUrl, destinationUrl, destinationType, isAutomatic, createDate }`
- Delegate to: `get-redirect-by-id`
- Description: "View the full details of a URL redirect including when it was created and whether it was automatic."

**`delete-redirect`**
- Input: `id` (uuid)
- Output: `{ message, id, originalUrl }`
- Fetch redirect details for confirmation
- Elicitation: "Delete redirect from '{originalUrl}' to '{destinationUrl}'? Visitors following the old URL will get a 404." Default unchecked.
- Delegate to: `delete-redirect`
- Description: "Delete a URL redirect. Visitors following the original URL will get a 404 error. You will be asked to confirm."

**`get-redirect-status`**
- Input: (none)
- Output: `{ isEnabled, message }`
- Delegate to: `get-redirect-status`
- Description: "Check whether automatic URL redirect tracking is enabled on the site. When enabled, Umbraco automatically creates redirects when pages are moved or renamed."

## Mode Registry

New modes:
- `scheduling` — includes `scheduling` collection
- `redirects` — includes `redirect` collection

## Worker Configuration

No changes needed.

## Testing

### Integration tests (per collection, using integration-test-creator agent)
- `scheduling/__tests__/` — get-publish-status on a known page, list-scheduled-content, schedule-publish + cancel-schedule lifecycle, elicitation accept/reject
- `redirect/__tests__/` — list-redirects, get-redirect (if any exist), get-redirect-status, delete-redirect elicitation reject

### Eval tests (using eval-test-creator agent)
- "Is the homepage scheduled to publish?" — requires get-publish-status
- "What pages are scheduled to publish?" — requires list-scheduled-content
- "Schedule the homepage to publish next Monday" — requires schedule-publish
- "What URL redirects are on the site?" — requires list-redirects
- "Is redirect tracking enabled?" — requires get-redirect-status

## File Structure

```
src/umbraco-api/tools/
  scheduling/
    index.ts
    get/
      get-publish-status.ts
      list-scheduled-content.ts
    post/
      schedule-publish.ts
      cancel-schedule.ts
    __tests__/
  redirect/
    index.ts
    get/
      list-redirects.ts
      get-redirect.ts
      get-redirect-status.ts
    delete/
      delete-redirect.ts
    __tests__/
```

## Success Criteria

- 8 new tools registered and working in both stdio and hosted modes
- list-scheduled-content uses adaptive scanning (full tree for small sites, scoped for large)
- delete-redirect warns about 404 consequences
- Integration and eval tests pass
- Total tool count: 81 (73 existing + 8 new)
- This completes the editor MCP feature set
