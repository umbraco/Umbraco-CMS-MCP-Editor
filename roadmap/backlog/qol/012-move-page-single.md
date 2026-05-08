# Move a Single Page (Without Bulk)

## The Friction

We have `bulk-move` for moving multiple content nodes. But there's no simple `move-page` for moving one page. An editor saying "move the FAQ page under Support" has to use a bulk tool designed for batch operations, or use the UI's "Move to..." dialog which opens a tree picker.

## Proposed Tool: `move-page`

**Input:**
- `id` (uuid) — page to move
- `targetParentId` (uuid) — new parent

**Output:**
- Confirmation: "Moved 'FAQ' from 'Home' to 'Support'"
- Warning if URL will change

**API:** `PUT /document/{id}/move`

## Why It Matters

Simple, obvious tool that matches how editors think. "Move this page there." One command. The bulk-move tool is overkill for a single page and requires wrapping the ID in an array.
