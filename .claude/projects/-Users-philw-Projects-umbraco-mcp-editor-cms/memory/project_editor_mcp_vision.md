---
name: Editor MCP vision and feature ideas
description: Simon Antony's email outlining what an editor-focused MCP should include — content auditing, bulk ops, multilingual, reporting, and safety model
type: project
---

Simon Antony (Umbraco Silver Partner, hello@simonantony.co.uk) emailed Phil on 2025-12-16 with feature ideas for the editor MCP, from an agency/client perspective.

**Key feature areas:**
- Content health/auditing (missing meta, alt text, stale content, broken media)
- Bulk content operations with safeguards (update properties across pages, re-tag/re-categorise)
- Multi-language support (draft translation variants, missing translations, sync structure)
- Reporting for non-technical users (published this month, content not reviewed in a year)

**Safety model:**
- Read operations: generally fine
- Write operations: need preview/approval before commit
- Schema changes: off limits entirely
- Everything logged and auditable
- "Dry run" mode showing what would change without doing it

**Why:** The dev MCP helps with site builds but clients buy ongoing services they can see and use, not faster dev work. The editor MCP sells to clients directly.

**How to apply:** Use these as guiding feature areas when building tools for this project. Prioritise read/audit tools first, then write operations with safeguards.
