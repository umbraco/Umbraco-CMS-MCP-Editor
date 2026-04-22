# Multilingual Content Helper

## The Editor's Problem

For multilingual sites, editors face the hardest content management challenge: keeping translations in sync. When the English version of a page changes, all other language variants need updating. In the UI, an editor has to:

1. Open the English page, note what changed
2. Switch to each language variant one by one
3. Translate or update the changed content
4. Save each variant
5. Track which pages need translation across the whole site
6. Remember which languages are complete and which are behind

Our `report-translation-coverage` and `list-untranslated` tools help find gaps, but the actual work of identifying what changed and coordinating updates is still entirely manual.

## What This Enables

**"What content changed in English that needs updating in French?"** — Compare the English variant's last edit date with the French variant. For pages where English was edited more recently, show what changed.

**"Translate this page into German"** — The LLM reads the English content, generates a German translation, and creates/updates the German variant. (The LLM IS a translator.)

**"Sync all language variants of the homepage"** — Identify fields that differ between the primary language and variants, show the differences, offer to update.

**"Which languages are behind?"** — A dashboard-style view: "English: 100% complete, French: 85% (12 pages need updates), German: 60% (32 pages untranslated)"

## How It Works

1. `list-languages` — get all configured languages
2. `list-untranslated` — find pages without variants
3. `get-page` — read content in the primary language
4. `copy-variant` / `create-variant` — create translations
5. `edit-page` — update variant content with translations
6. LLM translation — generate translations contextually

## Proposed Enhancement: `report-variant-drift`

Goes beyond "untranslated" to find pages where the primary language was updated AFTER the variant was last edited — meaning the translation is stale.

**Input:**
- `primaryCulture` (string, e.g. "en-US") — the source language
- `targetCulture` (string, e.g. "fr-FR") — the language to check

**Output:**
- Pages where primary was edited after the variant
- Per-page: what changed in the primary since the variant was last saved
- Priority ranking by page importance (homepage first, deep pages last)

## Why This Goes Beyond the UI

The UI shows one language variant at a time. There's no side-by-side comparison, no "what changed since last translation" view, no drift detection. The split-view shows two languages simultaneously but only for one page — and still requires the editor to manually spot differences.

The LLM can compare all variants across all pages in seconds and tell editors exactly where attention is needed. And it can actually do the translation work itself for many language pairs.

## Editor Story

> "We updated 15 pages in English last week. Can you check what needs translating in French and German, and do the French translations for me?"

The LLM identifies the 15 pages, checks which have stale French/German variants, generates French translations for all 15, saves them as drafts for review, and provides a list of the 15 German pages that still need a human translator.
