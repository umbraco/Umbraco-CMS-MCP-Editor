# Intelligent Media Library Cleanup

## The Editor's Problem

Media libraries grow endlessly. Editors upload images but rarely delete old ones. Over time:
- Hundreds of unused images accumulate
- Duplicate images exist under different names
- Images are in wrong folders or not in folders at all
- Old campaign images still take up space
- File names are meaningless ("IMG_20240315_092847.jpg")

In the UI, cleaning this up means browsing through every folder, checking each image's "Referenced by" list on the Info tab, and deciding one by one what to keep.

## What This Enables

**"Clean up the media library"** — The LLM runs a comprehensive audit:
  - Find unused media (`report-unused-media`)
  - Find oversized images (`report-large-media`)  
  - Find images without alt text (`report-media-missing-alt`)
  - Check for duplicate file names or similar images
  - Identify media in the root that should be in folders
  - Flag old media not referenced by any published content

**"Organize the media library"** — Move misplaced media into appropriate folders based on their usage context.

**"Reduce our media storage"** — Find the biggest space-saving opportunities: unused large files, duplicate uploads, images that are 4000px wide but only used at 400px.

## How It Works

1. `report-unused-media` — find unreferenced media
2. `report-large-media` — find oversized files
3. `list-media-children` — walk the media tree
4. `get-media` — check individual items (references, size, type)
5. `search-media` — find duplicates by name
6. LLM analysis — correlate findings into a prioritised cleanup plan
7. `delete-media` or `move-media` — act on editor's decisions

## Proposed Enhancement: `report-media-duplicates`

**Input:** none (or folder ID to scope)

**Output:**
- Groups of media items with identical or very similar filenames
- Size comparison within each group
- Which ones are referenced vs unused
- Recommendation: keep the referenced one, delete the rest

## Why This Goes Beyond the UI

The UI shows one folder at a time, one image at a time. There's no "find duplicates" or "show me everything that's wasting space." The LLM can cross-reference usage, size, naming, folder location, and age to produce an actionable cleanup plan.

The `GET /imaging/resize/urls` endpoint even tells us what sizes images are actually served at — so we could identify images that are stored at 5000px but only ever displayed at 500px.

## Editor Story

> "Our media library has 2,000 items and it's a mess. Help me clean it up."

The LLM reports: "Found 340 unused images (180MB), 45 images over 5MB, 23 likely duplicates, and 67 images not in any folder. Biggest wins: delete 340 unused images to free 180MB, and compress 12 hero images from 8MB to 800KB each."
