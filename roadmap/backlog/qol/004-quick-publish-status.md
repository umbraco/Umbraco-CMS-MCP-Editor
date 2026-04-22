# Quick Publish Status Overview

## The Friction

An editor managing a section of the site wants to know: "Which of these pages are published, which are drafts, which have unpublished changes?" In the UI:
1. The content tree shows a small icon/indicator per page — but you have to look at each node
2. For detailed status (draft with unpublished changes vs never published), you need to open each page individually
3. There's no way to see "all pages under Blog and their publish status" in one view

The tree view shows status for visible nodes, but:
- You can't see descendants without expanding every node
- You can't filter by status
- You can't tell the difference between "published" and "published but has pending draft changes"

## Proposed Tool: `report-publish-overview`

**Input:**
- `parentId` (uuid, optional) — scope to a section
- `includeDescendants` (boolean, default true) — walk the whole subtree

**Output:**
- Per page: name, status (Published / Draft / PublishedWithPendingChanges / Scheduled), last publish date, last edit date
- Summary: "12 published, 3 draft, 2 with pending changes, 1 scheduled"
- Sorted by status (drafts first — they need attention)

## API Endpoints

- `GET /document/{id}` — has variant state (Published, Draft, etc.)
- `GET /document/{id}/published` — exists only if published  
- `GET /tree/document/children` — walk the tree

## Why It Matters

This is the editorial equivalent of a project status board. "What's the state of all my content?" is a question editors ask constantly, especially when coordinating with a team. The UI makes you check one page at a time. This tool gives the big picture instantly.

**Key insight**: The API returns variant `state` which can be "Published", "Draft", "PublishedPendingChanges" — the tree view in the UI shows this as subtle icons that are easy to miss. Surfacing this as a clear report is immediately useful.

## Real Editor Scenarios

- "Show me what's still in draft under the new Products section"
- "Which pages have changes waiting to be published?"
- "Is everything published for the launch tomorrow?"
