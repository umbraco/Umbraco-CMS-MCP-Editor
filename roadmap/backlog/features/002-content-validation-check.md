# Content Validation Check (Pre-flight)

## The Insight

The API has dedicated validation endpoints: `POST /document/validate` and `PUT /document/{id}/validate`. These let you check if content is valid **without saving it**. The UI only shows validation errors reactively — when you try to save, it rejects and shows red fields. There's no way to ask "will this save succeed?" without trying.

An LLM can run validation proactively, before committing changes, and explain what's wrong in plain language.

## What This Enables

**"Check if this page is ready to publish"** — Run validation against the current draft content before attempting to publish. Catch missing required fields, invalid values, content too short for mandatory fields, etc.

**"Validate all my draft pages"** — Batch validation across all pages with pending changes. "You have 12 pages with unpublished changes. 3 have validation errors: the Contact page is missing a required email field, the About page has an invalid URL in the hero link."

**"What would break if I clear this field?"** — Before making a change, check whether removing a value would cause a validation failure.

## API Endpoints Used

- `POST /document/validate` — validate a new document before creation
- `PUT /document/{id}/validate` — validate changes to an existing document
- `POST /media/validate` — validate media items
- `POST /member/validate` — validate member data

## Proposed Tool: `validate-page`

**Input:**
- `id` (uuid) — page ID to validate
- `values` (array, optional) — proposed property changes to validate without saving

**Output:**
- Valid: true/false
- Errors: array of { propertyAlias, message, culture }
- Warnings: array of advisory messages

## Proposed Tool: `validate-all-drafts`

**Input:** none (or optional document type filter)

**Output:**
- List of all pages with unpublished changes
- Per-page validation status
- Summary: "15 draft pages, 12 valid, 3 with errors"

## Why This Goes Beyond the UI

The UI only validates when you click Save — and it shows errors as red outlines on form fields. If the error is on a different tab than the one you're viewing, you might not even see it. There's no way to validate without attempting the save, and definitely no way to batch-validate multiple pages.

The LLM can validate proactively, explain errors in natural language, and even suggest fixes: "The 'seoDescription' field requires at least 50 characters. Your current description is 23 characters. Here's a suggested improvement: ..."

## Compound Scenarios

- **Pre-publish audit**: validate-page + compare-draft-to-published + publish-page
- **Content quality gate**: validate all drafts, fix errors, then bulk-publish
- **Hypothetical editing**: "Would this content be valid?" without saving
