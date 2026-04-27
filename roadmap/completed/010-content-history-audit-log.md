# Page / Media Change History

## Problem

The Umbraco UI shows a **"History"** section on the Info tab of a content page. It's a paginated audit log of every action performed on that page — saves, publishes, unpublishes, moves, etc. — with timestamp and user. Media items have the equivalent.

Our existing tools don't cover this:

| Tool | Scope | What it answers |
|------|-------|-----------------|
| `list-versions` | one page | "What did this page look like on March 10?" — snapshots for rollback |
| `report-recently-changed` | site-wide | "What changed across the site recently?" — modified pages list |
| **Missing** | one page | "Who did what to this page and when?" — the operational log |

## UI Workflow (Reproduction Steps)

1. Navigate to Content section
2. Open any content node (e.g. Home)
3. Click the **"Info"** tab (top navigation: Content | Versions | Workflow | Info)
4. The **"History"** section shows:
   - User who performed the action (e.g. "MCP User", "Administrator")
   - Timestamp (e.g. "April 10, 2026 at 10:09:29 PM")
   - Action type (e.g. "Save", "Publish")
   - Description (e.g. "Content saved")
5. Paginated

## Naming

**`get-page-change-history`** — not `get-page-history` (which collides with `list-versions` — both are "history" in some sense), and not `get-page-audit-log` (correct in API terms but sounds like compliance tooling to a non-technical editor). "Change history" is what the UI and editors call it.

## Proposed Tools

### `get-page-change-history`

**Input:**
- `id` (uuid) — page ID
- `cursor` (string, optional) — opaque pagination cursor per the project convention; `withCursorPagination` decorator handles translation to/from skip/take at the MCP boundary

**Output:**
- Array of entries: `{ user, timestamp, action, description }`
- `nextCursor` when more entries are available

Chains to dev-MCP `get-document-audit-log`.

### `get-media-change-history`

Same shape, targeting media items. Chains to `get-media-audit-log`. Ship alongside the page version — the pattern is identical and the editor question ("who replaced the hero image?") is just as common.

## Why Not Combined With Adjacent Tools

- **Not `list-versions`:** different output (content snapshots vs event log), different purpose (rollback vs governance/debugging).
- **Not `report-recently-changed`:** different axis (one page vs tree-wide).

Keep them distinct. A single "show me history" tool with a flag is the wrong abstraction — the output shapes and use cases diverge.

## Not Building: Site-Wide Audit Log

Tempting but **blocked**. The dev MCP only exposes per-item audit logs (`get-document-audit-log`, `get-media-audit-log`) — there is no site-wide audit endpoint. A cross-site tool would have to walk the content tree and call the per-item endpoint for every node, which is exactly the pattern the existing tree-walking tools were disabled for (see commit 24663b3, disabling tree walkers pending a filtered-pages endpoint).

Revisit only if a site-wide audit endpoint appears in the CMS management API. Until then, per-page / per-media change history is the ceiling. Same reasoning kills "per-user activity" — it would need the same cross-site walk.

## Dev MCP Support

- `get-document-audit-log` — per-document audit log
- `get-media-audit-log` — per-media audit log

Both are read-only with permission-based `enabled` guards in the dev MCP.

## Why This Matters

- "Who last edited this page?" / "When was this page last published?"
- Debugging stale-content reports: "Why does this page show old content?" — check recent publishes
- Content governance: "Has this page been modified since approval?"
- Complements `list-versions` — versions show *what* changed; change history shows *who/when/what action*.

## Scope

Two tools, both read-only, both chain directly to existing dev-MCP tools. No elicitation, no writes. Small.

## Impact

Medium — meaningful for governance and debugging workflows, but not a daily-use tool.
