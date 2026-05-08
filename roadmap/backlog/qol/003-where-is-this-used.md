# "Where Is This Used?"

## The Friction

An editor is looking at a media item, a category page, an author page, or any piece of content and wants to know: "Where is this actually used on the site?" 

In the UI, the answer is buried on the Info tab under "Referenced by" — but you have to navigate there, and it only shows direct references. For an author page, the editor wants to know "Which articles are by this author?" For a category, "Which articles are in this category?" For a media item, "Which pages use this image?"

The current flow:
1. Open the item
2. Click the Info tab
3. Scroll to "Referenced by"
4. See a flat list (no context about HOW it's referenced)

This requires navigating away from whatever the editor was doing.

## Proposed Tool: `where-is-this-used`

**Input:**
- `id` (uuid) — any content or media item

**Output:**
- List of pages referencing this item
- For each: page name, document type, which property contains the reference, publish status
- Grouped by relationship type: "Used as author on 5 articles", "Used as hero image on 3 pages"

## API Endpoints

- `GET /document/{id}/referenced-by` — pages linking to content
- `GET /media/{id}/referenced-by` — pages using media
- `GET /relation/type/{id}` — understand relationship types

## Why It Matters

This is a constant question for editors: "What depends on this?" Before editing an author's name, before replacing an image, before deleting a category — they need to understand the impact. The current tool requires navigating away from context. A single command gives instant answers.

**Key difference from explore/006 and explore/013**: This tool works for ANY item type (content, media) and explains HOW it's used, not just where. "This image is used as 'mainImage' on Homepage and as 'authorPhoto' on the Author page" is far more useful than just a list of page names.

## Real Editor Scenarios

- "Which blog posts are by Paul Seal?" — check references to the author page
- "What pages use the old logo?" — before replacing it
- "Is the 'Community' category used anywhere?" — before renaming or deleting
