# Content Tone and Style Audit

## The Editor's Problem

Brands have voice guidelines: formal vs friendly, technical vs accessible, active vs passive voice. When multiple editors write content over months or years, the tone drifts. Some pages sound corporate, others sound casual. Some use jargon, others are plain language.

No UI can assess tone. An editor would have to read every page themselves.

## What This Enables

**"Does our website sound consistent?"** — The LLM reads all content and identifies pages that deviate from the majority tone.

**"Make our content more accessible"** — Find pages using jargon, complex sentences, or reading levels above the target audience.

**"Apply our brand voice guidelines to this section"** — Given style rules ("always use active voice, first person plural, contractions OK"), scan pages and flag violations.

**"Simplify the legal pages"** — Rewrite overly complex content to meet a target reading level while preserving meaning.

## How It Works

1. `list-children` / `search-content` — gather pages
2. `get-page` — read all content
3. LLM analysis — assess tone, reading level, voice, style
4. Report: pages grouped by tone, outliers flagged, specific examples
5. Optionally `edit-page` — rewrite content to match guidelines

## Why This Goes Beyond the UI

This is pure LLM capability. No CMS UI can understand tone, assess reading level, detect passive voice, or identify when content doesn't match brand guidelines. The LLM reads content like a professional copywriter reviewing the entire site.

## Editor Story

> "We're updating our brand to be more friendly and approachable. Can you flag any pages that still sound too corporate?"

The LLM reads the site and reports: "12 pages use formal corporate tone. The worst offenders are: 'Terms of Service' (expected), 'About Us' (should be warmer), 'Product Overview' (very technical, consider simplifying), and 'Contact' (unnecessarily formal). Here are suggested rewrites for the About Us page..."
