# Find and Replace Across the Whole Site

## The Editor's Problem

A company rebrand changes "Acme Corp" to "Acme Global". A product is renamed. A phone number changes. A legal disclaimer needs updating on every page. In the Umbraco UI, the editor has to:

1. Search for content containing the old text
2. Open each page individually
3. Find the right property on the right tab
4. Edit the text
5. Save
6. Repeat for every match
7. Remember to publish everything

For a site with hundreds of pages, this could take an entire day.

## What This Enables

**"Change our phone number from 0800-123-456 to 0800-789-012 everywhere on the site"** — The LLM searches all content, finds every occurrence across every property on every page, shows the editor what will change, and makes all the edits with a single confirmation.

**"Replace all mentions of 'Basic Plan' with 'Starter Plan'"** — Brand/product rename across the entire site.

**"Update the copyright year from 2025 to 2026 on all pages"** — Common annual maintenance task.

## How It Works

1. `search-content` — find pages containing the search term
2. `get-page` — read full content of each matching page
3. Identify which properties contain the match (the LLM does the text scanning)
4. Show editor: "Found 'Acme Corp' in 23 properties across 14 pages"
5. `edit-page` — update each page with the replacement
6. Optionally `publish-page` — publish the changes

## Why This Goes Beyond the UI

Umbraco has no find-and-replace feature. The search only finds pages — it doesn't tell you which property contains the match. The editor has to manually open each page and hunt through all tabs and properties to find and change the text. Multiply by dozens of pages and this is a multi-hour task.

An LLM reads all properties programmatically, identifies exact matches, handles rich text vs plain text appropriately, and makes all changes in minutes with a single confirmation.

## Scope Control

The LLM should always:
- Show a preview of all changes before making them
- Report: "Will change X occurrences across Y pages in Z properties"
- Allow the editor to exclude specific pages
- Handle rich text carefully (don't break HTML)
- Offer to publish changed pages or leave as draft

## Editor Story

> "We just rebranded. Our company name changed from 'TechStar Solutions' to 'TechStar Digital'. Can you update it everywhere on the website?"

The LLM finds 47 occurrences across 22 pages, shows the list, the editor confirms, and all changes are made and published in under a minute.
