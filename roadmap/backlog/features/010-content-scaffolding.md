# Intelligent Content Scaffolding

## The Editor's Problem

Creating new content is the most time-consuming editorial task. An editor who needs to create 20 product pages has to:
1. Click "Create" on the parent node
2. Choose the document type
3. Fill in every property across multiple tabs (title, description, images, SEO, features, pricing, CTAs...)
4. Save and publish
5. Repeat 19 more times

Even with blueprints (content templates), the editor still has to manually customise each page. For structured content like products, events, team members, or FAQs, most of the structure is the same — only the specifics change.

## What This Enables

**"Create 10 product pages based on this spreadsheet"** — The editor provides structured data (product names, descriptions, prices) and the LLM creates fully-formed pages with all properties populated.

**"Add a new team member page for Sarah Chen, VP of Engineering"** — The LLM knows the document type structure, creates the page with sensible defaults, and fills in what it can from the instruction.

**"Create a blog post about our Q1 results"** — Given a topic and key points, the LLM creates a draft page with the right document type, populated SEO fields, and placeholder content structure.

**"Duplicate the Services section structure but for a new market"** — Clone a section's page structure, adapting content for a different audience/region.

## How It Works

1. `list-document-types` — understand available page types and their properties
2. `get-document-type-allowed-children` (new, from API: `GET /document-type/{id}/allowed-children`) — know what page types can be created where
3. `get-blueprint` — use existing content templates as starting points
4. `create-page` — create pages with populated properties
5. LLM intelligence — infer sensible property values from minimal input

## Proposed Tool: `describe-document-type`

**Input:**
- `documentTypeId` or `documentTypeAlias` — which document type to describe

**Output:**
- Human-readable description of all properties: name, type, description, required, validation rules
- Grouped by tab
- Which properties are mandatory vs optional
- What values are expected (text, image picker, content picker, etc.)

This tool gives the LLM (and the editor) a clear picture of what a page type needs without opening the Settings section.

## Proposed Tool: `get-allowed-child-types`

**Input:**
- `parentId` (uuid) — where you want to create content

**Output:**
- List of document types allowed as children here
- Each with: name, alias, description, icon, properties summary

## Why This Goes Beyond the UI

The UI creates one page at a time through a form. There's no batch creation, no data import, no intelligent defaulting. Blueprints help but still require manual customisation.

The LLM can:
- Understand the document type structure and create pages with appropriate content
- Batch-create pages from structured data
- Infer missing values from context ("VP of Engineering" → senior leadership team member type)
- Pre-populate SEO fields based on the content itself
- Check what document types are allowed before trying to create

## Editor Story

> "I've got a list of 15 upcoming events with dates, locations, and descriptions. Can you create event pages for all of them?"

The LLM checks which document type is used for events, understands its properties, creates 15 pages with all fields populated from the provided data, generates SEO descriptions for each, and saves them as drafts for review.
