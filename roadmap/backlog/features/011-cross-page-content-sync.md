# Cross-Page Content Synchronisation

## The Editor's Problem

Many sites have content that should be the same across multiple pages:
- Company address in the footer of every page
- A shared "About Us" blurb used on multiple landing pages  
- Product feature lists that appear on both the product page and comparison table
- Legal disclaimer text that must be identical everywhere

In Umbraco, this shared content lives in properties on individual pages. If the address changes, the editor has to find and update every page that contains it. There's no native "shared content" concept for simple text properties (blocks and content pickers help, but many sites don't use them consistently).

## What This Enables

**"Update our address everywhere"** — The LLM finds all pages containing the old address (across any property type), updates them all, and confirms.

**"Make sure the pricing on all product pages matches the pricing table"** — Read the canonical pricing from one source page, then check and fix all other pages.

**"Keep the footer content in sync across all pages that have a footer tab"** — Check that a specific property has the same value across a set of pages.

## How It Works

1. `search-content` — find pages containing the content to sync
2. `get-page` — read current values
3. LLM comparison — identify mismatches
4. `edit-page` — update pages to match the canonical version
5. Report what was changed

## Why This Goes Beyond the UI

The UI operates one page at a time. There's no "sync these pages" or "ensure this value is the same everywhere" feature. The LLM can treat the entire site as a database and enforce consistency rules that the UI simply can't express.

## Editor Story

> "We moved offices. The old address '123 High Street' should now be '456 New Road' on every page. And make sure the map embed is updated too."

The LLM finds the address in 34 properties across 18 pages, the map embed on 5 pages, updates everything, and publishes.
