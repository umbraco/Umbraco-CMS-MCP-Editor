# Natural Language Content Search

## The Editor's Problem

Umbraco's search finds pages by keyword matching. But editors think in natural language:
- "Find the page about our return policy"
- "Where's the content about team building events from last year?"
- "Which product pages mention free shipping?"
- "Find all pages that talk about sustainability"

The UI search matches keywords against indexed content. It can't understand intent, synonyms, or semantic meaning.

## What This Enables

**"Find our return policy page"** — Even if the page is called "Refund & Exchange Guidelines" — the LLM understands that's about returns.

**"Which pages mention pricing?"** — Find pages about pricing even if they say "cost", "rate", "fee", or "investment" instead of "price".

**"Find content about COVID that should be updated"** — Semantic search plus staleness detection.

**"What do we say about data privacy?"** — Find all content related to GDPR/privacy across the site, even if spread across different sections.

## How It Works

1. `search-content` — keyword search as a starting point
2. `get-page` — read full content for semantic analysis
3. Examine searcher API (`GET /searcher/{searcherName}/query`) — direct index queries for powerful full-text search
4. LLM reasoning — understand intent, match semantically, filter false positives

## The Examine Searcher API

The API has `GET /searcher/{searcherName}/query` which allows querying Umbraco's Examine (Lucene) search indexes directly with a search term. This is more powerful than the basic search — it supports full-text search across all indexed fields.

Our `search-content` tool likely wraps a simpler search. A direct Examine query tool could be much more powerful for editors.

## Proposed Enhancement: `search-content-advanced`

**Input:**
- `query` (string) — natural language search query
- `documentType` (string, optional) — filter by page type
- `parentId` (uuid, optional) — search within a section

**Behaviour:**
The LLM translates the natural language query into effective search terms, runs the search, then reads the top results and re-ranks by relevance to the original intent. This two-pass approach (search then filter) gives much better results than keyword search alone.

## Why This Goes Beyond the UI

The UI search is keyword-based. The LLM understands that "return policy" might be on a page titled "Customer Service FAQ" under a property called "refundPolicy". It can search broadly, then narrow intelligently.

## Editor Story

> "I remember we have a page somewhere about our environmental commitments. Can you find it?"

The LLM searches for "environmental", "sustainability", "green", "eco", "carbon" — finds the page called "Our Responsibility" under the About section, and reports: "Found it: 'Our Responsibility' under About > Company. It was last updated 8 months ago — you might want to refresh it."
