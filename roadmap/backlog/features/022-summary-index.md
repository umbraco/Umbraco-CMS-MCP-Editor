# Imaginative Tools — Summary Index

These proposals go beyond what the Umbraco backoffice UI offers. They leverage the LLM's ability to cross-reference data, reason about content, and orchestrate multi-step workflows.

## Categorised by Theme

### The LLM as Content Analyst
| # | Tool | Core Idea | Impact |
|---|------|-----------|--------|
| 001 | Draft vs Published Diff | Compare what's live vs what's pending | High |
| 002 | Validation Check | Pre-flight validation without saving | Medium |
| 003 | Safe Delete Check | Check references before deleting | High |
| 004 | Content Readiness Report | Multi-dimensional launch checklist | High |
| 008 | Consistency Checker | Find terminology/data mismatches | Medium |
| 015 | Site Health Dashboard | Aggregate all health metrics | High |
| 017 | Link Health Checker | Find broken internal references | Medium |

### The LLM as Content Editor
| # | Tool | Core Idea | Impact |
|---|------|-----------|--------|
| 005 | Find and Replace | Site-wide text replacement | High |
| 007 | Alt Text Generator | AI-generated accessible alt text | High |
| 011 | Content Sync | Keep shared content consistent | Medium |
| 016 | Tone and Style Audit | Brand voice compliance | Medium |

### The LLM as Content Manager
| # | Tool | Core Idea | Impact |
|---|------|-----------|--------|
| 006 | Content Expiry Manager | Find time-sensitive stale content | Medium |
| 009 | URL Manager | URL audit and impact analysis | Medium |
| 010 | Content Scaffolding | Intelligent batch page creation | High |
| 012 | Media Library Cleanup | Comprehensive media audit | Medium |
| 013 | Content Migration | Split, merge, reorganize pages | High |
| 014 | Multilingual Helper | Translation drift detection and AI translation | High |
| 018 | Protect Versions | Bookmark important content states | Low |
| 019 | Content Calendar | Publishing timeline and planning | Medium |
| 020 | Member Access Audit | Cross-reference members and restricted content | Low |
| 021 | Natural Language Search | Semantic content finding | Medium |

## What's Different About These

None of these are simple CRUD wrappers. They fall into three categories:

1. **Multi-tool orchestration** — combining existing tools in ways the UI can't (health dashboard, readiness report, safe delete check)
2. **LLM reasoning over content** — things only an LLM can do (tone audit, alt text generation, semantic search, consistency checking)  
3. **Batch intelligence** — doing at scale what the UI does one-at-a-time (find-replace, content scaffolding, media cleanup)

## Implementation Notes

Most of these don't need new API endpoints — they compose existing tools. The key new tools needed to enable them are:
- `edit-media` (for alt text) — see explore/012
- `check-safe-to-delete` — wraps referenced-by + referenced-descendants
- `compare-draft-to-published` — wraps get-document + get-document-published
- `validate-page` — wraps document validate endpoint
- `describe-document-type` — wraps document-type endpoint
- `get-allowed-child-types` — wraps allowed-children endpoint

Some (like the health dashboard, readiness report, find-replace) are really **LLM workflows** rather than tools — they describe how an LLM should orchestrate existing tools to achieve editorial goals. These could be captured as prompt patterns or example conversations rather than implemented as individual tools.
