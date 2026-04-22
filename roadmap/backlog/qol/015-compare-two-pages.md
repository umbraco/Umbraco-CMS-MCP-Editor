# Compare Two Pages

## The Friction

An editor has two similar pages — maybe two product pages, or an original and a duplicate — and wants to see how they differ. In the UI, you'd need two browser tabs, open each page side-by-side, and manually compare every property across every tab. For pages with 15+ properties across 3 tabs, this is exhausting.

## Proposed Tool: `compare-pages`

**Input:**
- `id1` (uuid) — first page
- `id2` (uuid) — second page

**Output:**
- Properties that are identical (collapsed summary)
- Properties that differ: show both values side by side
- Properties unique to one page (different document types)
- Structural differences: different document type, different parent, different status

## Why It Matters

Common scenarios:
- "I duplicated this page — what did I forget to change?" 
- "These two product pages should be consistent — what's different?"
- "The client says the staging version is different from production — compare them"
- After a copy-variant for translation: "What still needs translating?"

The LLM can present this as natural language: "The pages are identical except: 'Enterprise' has a pricing table block that 'Starter' doesn't, and the subtitle is different."
