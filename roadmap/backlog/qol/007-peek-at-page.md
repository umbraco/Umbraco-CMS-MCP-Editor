# Peek at a Page (Quick Summary)

## The Friction

An editor browsing the content tree wants to quickly check what's on a page without opening it. In the UI, clicking a page triggers a full workspace load — the entire editing interface renders with all tabs, properties, and block editors. This takes 1-3 seconds and replaces the current view entirely. To go back, you click another page and wait again.

There's no "hover preview" or "quick glance" at a page's content. Every page requires a full navigation.

Our `get-page` tool returns everything, which is great for programmatic use but verbose for a quick check.

## Proposed Tool: `peek-page`

**Input:**
- `id` (uuid) — page to peek at

**Output (deliberately concise):**
- Name, document type, status (Published/Draft)
- Last edited: date and by whom
- Key properties only: title, subtitle, main image name (skip boolean flags, empty fields, and technical properties)
- Child count
- One-line summary of block content: "3 content blocks: Hero Banner, Feature Grid, CTA"

**Design principle:** Returns what an editor would glance at to decide "is this the page I'm looking for?" — not the full editing payload.

## Why It Matters

This is the CMS equivalent of file preview in Finder/Explorer. Editors constantly browse the tree looking for content — "which page has the pricing table?" or "is this the right article?" Every full page open is 2-3 seconds of context switching. A peek gives the answer in milliseconds.

## Comparison

| | `get-page` | `peek-page` |
|---|---|---|
| Purpose | Full data for editing | Quick identification |
| Block content | Count only | Block type names |
| Boolean flags | All shown | Omitted |
| Empty properties | Shown as null | Omitted |
| Media pickers | Raw IDs | Image names |
| Content pickers | Raw IDs | Page names |
| Output size | Large | Compact |

## Real Editor Scenarios

- "What's on the Features page?" — quick check without loading the editor
- "Which of these blog posts is about the conference?" — peek at several rapidly
- "Does the Contact page have a subtitle?" — quick answer without navigating
