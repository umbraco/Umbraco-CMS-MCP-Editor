# Toggle Boolean Flags

## The Friction

Umbraco pages commonly have boolean toggle properties: `hideFromTopNavigation`, `umbracoNaviHide`, `isIndexable`, `isFollowable`, `hideFromXMLSitemap`. Changing any of these requires:
1. Navigate to the page
2. Find the right tab (these are often on SEO or Settings tabs)
3. Click the toggle
4. Save

For a single flag on a single page, that's 4 steps. For "hide 10 pages from navigation", that's 40 steps.

Our `edit-page` tool can set these, but the editor has to know the exact property alias and the fact that it's a boolean. The alias names aren't intuitive — `umbracoNaviHide` vs `hideFromTopNavigation` vs `hideFromXMLSitemap`.

## Proposed Tool: `toggle-page-flag`

**Input:**
- `id` (uuid or array of uuids) — page(s) to update
- `flag` (enum) — human-friendly flag name: "hide-from-nav" | "hide-from-search" | "hide-from-sitemap" | "no-index" | "no-follow"

**Behaviour:**
1. Map the friendly flag name to the actual property alias (handles the alias confusion)
2. Read current value
3. Toggle it (or set explicitly with an optional `value` parameter)
4. Save
5. Report: "Set 'no-index' on 3 pages: Features, About, Contact"

**Why human-friendly flag names matter:**
An editor says "hide this from search engines" — they don't know if that's `isIndexable`, `hideFromSearch`, or `noIndex`. The tool maps editorial intent to technical aliases.

## Bulk Variant

Works on multiple pages at once. The same toggle applied across a list.

## Why It Matters

These toggles are the most tedious edits in Umbraco. Each one requires a full page load just to flip a switch. They're always on a different tab than the content itself, so the editor has to navigate within the page too.

The friction is wildly disproportionate to the action — flipping a boolean should take 1 second, not 15.

## Real Editor Scenarios

- "Hide the old blog posts from navigation"
- "Make the legal pages no-index"
- "Show the new product pages in the sitemap"
- "Hide the staging pages from everything"
