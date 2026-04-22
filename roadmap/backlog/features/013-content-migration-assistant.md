# Content Migration Assistant

## The Editor's Problem

Editors regularly need to restructure their site:
- Move a section from one part of the tree to another
- Split a long page into multiple child pages
- Merge multiple pages into one
- Reorganize content after a site redesign
- Convert pages from one document type to another (when the developer has set up the new type)

In the UI, each of these is a multi-step manual process. Moving a section means moving each page one by one. Splitting a page means creating new pages, copying content property by property, then updating or redirecting the original.

## What This Enables

**"Split the 'Services' page into individual pages for each service"** — The LLM reads the Services page, identifies the distinct services (perhaps from block list content or sections), creates individual child pages for each, populates them with the relevant content, and updates the parent page to link to the children.

**"Merge these 3 short pages into one comprehensive page"** — Read content from multiple pages, combine intelligently (the LLM understands which sections complement each other), create or update the target page, and offer to redirect/delete the originals.

**"Move the entire FAQ section under Support"** — Bulk move with safety checks (references, URLs, redirects).

**"Our blog posts used to be flat. Organize them into monthly folders."** — Create the folder structure, move posts into the right month based on their creation dates.

## How It Works

For page splitting:
1. `get-page` — read the source page with all its content
2. `inspect-blocks` — understand block structure if content uses blocks
3. `list-document-types` / `get-allowed-child-types` — know what types can be created
4. `create-page` — create new pages with extracted content
5. `edit-page` — update the parent to reference children
6. `publish-page` — publish the new structure

For merging:
1. `get-page` (multiple) — read all source pages
2. LLM reasoning — combine content logically
3. `edit-page` — update the target page with merged content
4. `delete-page` — remove the originals (with confirmation)

## Why This Goes Beyond the UI

The UI can move a page to a new parent, and that's it. It can't split, merge, reorganize by logic, or batch-restructure. Each of these is a sequence of 10+ manual operations per page. The LLM orchestrates multi-step content transformations that would take an editor hours.

## Editor Story

> "We redesigned the site and 'Products' should now be split into 'Solutions' and 'Tools'. The first 5 product pages are solutions, the rest are tools. Can you set this up?"

The LLM creates the two new sections, moves the right pages into each, updates any cross-references, and publishes the new structure.
