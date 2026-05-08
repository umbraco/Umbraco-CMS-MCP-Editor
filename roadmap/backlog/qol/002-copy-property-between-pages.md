# Copy a Property Value Between Pages

## The Friction

An editor wants to use the same hero image, the same CTA text, or the same meta description on multiple pages. In the UI:
1. Open the source page
2. Find the property (possibly on a different tab)
3. Copy the value (for text: select all, copy. For media pickers or content pickers: note the selection. For blocks: impossible to copy)
4. Navigate to the target page
5. Find the same property
6. Paste or re-select the value
7. Save

For anything beyond plain text — media pickers, content pickers, block lists — you can't copy/paste at all. You have to manually re-select the same media item or re-build the same block structure.

## Proposed Tool: `copy-property`

**Input:**
- `sourceId` (uuid) — page to copy from
- `targetId` (uuid) — page to copy to (or array of IDs for multi-target)
- `alias` (string) — property alias to copy
- `targetAlias` (string, optional) — different alias on the target if the property name differs

**Behaviour:**
1. Read the source property value
2. Show what will be copied: "Copy 'mainImage' from 'Homepage' to 'About'"
3. Write to target page(s)

**Why it matters:**
- Editors frequently reuse content across pages
- Media picker values, content picker references, and block content are impossible to copy in the UI
- Multi-target: "Copy the hero image from Homepage to Features, About, and Contact" — one command instead of 12 steps

## Real Editor Scenarios

- "Use the same main image on all product pages"
- "Copy the SEO description from the English page to use as a starting point on the French page"
- "The footer social links should be the same on every page" (if using per-page footer properties rather than a shared component)
