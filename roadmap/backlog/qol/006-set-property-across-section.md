# Set a Property Across a Whole Section

## The Friction

An editor needs to set the same value on multiple pages: "Mark all pages under 'Archive' as not indexable" or "Set the author to 'Editorial Team' on all blog posts" or "Turn on 'hideFromTopNavigation' for all utility pages."

In the UI, this means opening every single page, navigating to the right tab, changing the value, and saving. For a section with 30 pages, that's potentially 120+ clicks.

We already have `bulk-set-property` which can set a property on multiple pages by ID. But the friction is in FINDING the right pages first. The editor has to manually build the list of page IDs.

## Proposed Enhancement: Section-Scoped Bulk Set

**What's different from `bulk-set-property`:**
The current tool takes explicit IDs (max 10). The enhancement would accept a `parentId` and apply the change to ALL descendants, without the editor needing to know or list the IDs.

## Proposed Tool: `set-property-in-section`

**Input:**
- `parentId` (uuid) — root of the section to update
- `alias` (string) — property alias
- `value` (any) — value to set
- `documentType` (string, optional) — only apply to pages of this type
- `includeParent` (boolean, default false) — also update the parent itself

**Behaviour:**
1. Walk all descendants of the parent
2. Filter by document type if specified
3. Check which pages have this property (skip pages where the alias doesn't exist)
4. Show: "Will set 'isIndexable' to false on 24 pages under 'Archive'"
5. Apply and save all pages
6. Report results

## Why It Matters

This is the "bulk edit column" that every spreadsheet user expects but no CMS offers. In a spreadsheet, you'd select a column, type a value, and press enter. In a CMS, you do it 30 times.

Combined with the LLM's understanding: "Make all archived articles non-indexable" — the LLM knows to find the Archive section, identify the `isIndexable` property, and apply `false` to all descendants.

## Real Editor Scenarios

- "Hide all pages under 'Old Site' from search engines"
- "Set the author to 'Content Team' on all unsigned blog posts"
- "Turn off 'hideFromTopNavigation' for all product pages"
- "Set the meta description to 'Contact us for more information' on all Contact-type pages"
