# Editor MCP Design

## Overview

An editor-friendly MCP server for Umbraco CMS that provides guided content management workflows for non-technical users. It chains to the existing `@umbraco-cms/mcp-dev` developer MCP internally but never exposes raw developer tools to editors.

Supports both local (stdio/Claude Desktop) and hosted (Cloudflare Worker with OAuth) deployment from the start.

## Target Users

Content editors, marketers, and site managers using AI assistants (Claude Desktop, hosted web UI) to manage their Umbraco site. These users don't know or care about document types, API endpoints, or CMS internals — they want to create pages, publish content, check site health, and handle bulk updates.

## Architecture

```
┌─────────────────────────────────────────────┐
│              AI Client                       │
│     (Claude Desktop / Hosted Web UI)         │
└──────────────────┬──────────────────────────┘
                   │ MCP Protocol + Elicitation
                   ▼
┌─────────────────────────────────────────────┐
│           Editor MCP Server                  │
│                                              │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │  Workflow    │  │  Utility Tools       │  │
│  │  Tools       │  │  (read-only, thin    │  │
│  │  (guided,    │  │   wrappers, friendly │  │
│  │   multi-step │  │   descriptions)      │  │
│  │   elicitation│  │                      │  │
│  │   wizards)   │  │                      │  │
│  └──────┬───────┘  └──────────┬───────────┘  │
│         │                     │              │
│  ┌──────┴─────────────────────┴───────────┐  │
│  │        Safety Layer                     │  │
│  │  - Write ops require confirmation       │  │
│  │  - Schema changes blocked entirely      │  │
│  │  - Dry run mode                         │  │
│  └──────────────────┬─────────────────────┘  │
│                     │                        │
│  ┌──────────────────┴─────────────────────┐  │
│  │     mcpClientManager (chaining)         │  │
│  │     Calls dev MCP tools internally      │  │
│  └──────────────────┬─────────────────────┘  │
└─────────────────────┼────────────────────────┘
                      │ stdio / in-process
                      ▼
┌─────────────────────────────────────────────┐
│         @umbraco-cms/mcp-dev                 │
│   (CMS Developer MCP - not exposed to user)  │
└─────────────────────────────────────────────┘
```

### Key Architectural Decisions

- **No proxied tools** — dev MCP tools are never exposed to the editor
- **Two tool tiers** — workflow (guided, multi-step elicitation) and utility (read-only, direct response)
- **Safety layer** between both tiers and the chained dev MCP
- **Both entry points** — `index.ts` (stdio) and `worker.ts` (hosted) register the same collections
- **Domain-organised collections** — tools grouped by content area (content, media, etc.), not by tier

## Tool Tiers

### Workflow Tools
Guided multi-step tools that use MCP elicitation to walk editors through processes. Used for write operations and complex tasks.

- Multi-step elicitation wizards (e.g. create page: pick type → pick parent → fill fields → preview → confirm)
- Disambiguation when requests are ambiguous ("Which blog post did you mean?")
- Confirmation gates before destructive operations
- Draft → validate → publish flow for content creation

### Utility Tools
Lightweight read-only tools with friendly descriptions. Return data directly without elicitation.

- Search and browse content/media
- Content health checks and audits
- Reports and status queries
- Version history viewing

The tier is a property of each tool (expressed via annotations and slices), not a folder structure.

## Collection Structure

```
src/umbraco-api/tools/
├── content/                    # Document/page management
│   ├── index.ts                # ToolCollectionExport
│   ├── get/                    # Utility: search, list, get page details
│   ├── post/                   # Workflow: create page wizard
│   ├── put/                    # Workflow: edit page
│   ├── delete/                 # Workflow: delete with confirmation
│   └── __tests__/
├── publishing/                 # Publish/unpublish workflows
│   ├── index.ts
│   ├── get/                    # Utility: publishing status, schedule
│   ├── post/                   # Workflow: publish with confirmation
│   └── __tests__/
├── versioning/                 # Version history & rollback
│   ├── index.ts
│   ├── get/                    # Utility: list versions, compare
│   ├── post/                   # Workflow: rollback with confirmation
│   └── __tests__/
├── media/                      # Media library
│   ├── index.ts
│   ├── get/                    # Utility: browse, search media
│   ├── post/                   # Workflow: upload wizard
│   ├── put/                    # Workflow: organise, update
│   ├── delete/                 # Workflow: delete with confirmation
│   └── __tests__/
├── blueprints/                 # Content templates
│   ├── index.ts
│   ├── get/                    # Utility: list available blueprints
│   ├── post/                   # Workflow: create page from blueprint
│   └── __tests__/
├── translation/                # Multi-language content
│   ├── index.ts
│   ├── get/                    # Utility: missing translations, sync status
│   ├── post/                   # Workflow: create translation variants
│   └── __tests__/
├── tags/                       # Tag management
│   ├── index.ts
│   ├── get/                    # Utility: list tags, find duplicates
│   ├── put/                    # Workflow: cleanup, consolidate tags
│   └── __tests__/
├── health/                     # Content health & auditing
│   ├── index.ts
│   ├── get/                    # Utility: broken refs, stale content, missing fields
│   └── __tests__/
├── seo/                        # SEO analysis & optimization
│   ├── index.ts
│   ├── get/                    # Utility: missing meta, alt text audit, URL analysis
│   ├── put/                    # Workflow: bulk fix SEO issues
│   └── __tests__/
├── reporting/                  # Reports for non-technical users
│   ├── index.ts
│   ├── get/                    # Utility: published this month, review status
│   └── __tests__/
├── redirects/                  # URL redirect management
│   ├── index.ts
│   ├── get/                    # Utility: list redirects
│   ├── post/                   # Workflow: create redirect
│   ├── delete/                 # Workflow: remove redirect with confirmation
│   └── __tests__/
├── search/                     # Search index management
│   ├── index.ts
│   ├── get/                    # Utility: check indexed content, search quality
│   └── __tests__/
├── bulk-operations/            # Cross-domain bulk updates
│   ├── index.ts
│   ├── post/                   # Workflow: bulk update with preview + confirmation
│   └── __tests__/
├── members/                    # Member management
│   ├── index.ts
│   ├── get/                    # Utility: browse, search members
│   ├── post/                   # Workflow: manage members
│   └── __tests__/
├── scheduling/                 # Scheduled publish/unpublish
│   ├── index.ts
│   ├── get/                    # Utility: upcoming scheduled actions
│   ├── post/                   # Workflow: schedule with confirmation
│   └── __tests__/
└── chained/                    # (existing) internal chaining helpers
    └── ...
```

## Elicitation Patterns

MCP elicitation is a core interaction pattern throughout the editor MCP. Three primary uses:

### 1. Disambiguation
When the editor's request is ambiguous, the tool asks for clarification before proceeding.
- "Which blog post did you mean?" with a list of matches
- "There are 3 document types for blog posts — which one?"

### 2. Multi-Step Wizards
Workflow tools guide the editor through a process step by step.
- Create page: pick type → pick parent → fill fields → preview → confirm
- Content creation follows: create draft → validate → publish

### 3. Confirmation Gates
Before destructive or significant write operations, the tool shows what will change and asks for confirmation.
- "This will unpublish 'About Us' and remove it from the live site. Continue?"
- Dry run mode: show what would change without doing it

## Safety Layer

- **Read operations**: no restrictions
- **Write operations**: require elicitation confirmation before executing
- **Schema changes**: blocked entirely — editor MCP never exposes document type, media type, or data type tools
- **Dry run mode**: tools can show what would change without committing
- **Auditable**: all operations logged

## Umbraco Workflow Integration

Transparent support for the Umbraco Workflow package. The editor MCP detects whether Workflow is installed on the Umbraco instance and adapts its behaviour automatically — editors don't need to know or care.

### Detection
On startup, attempt to connect to the Workflow chained MCP. If the connection succeeds, Workflow is available. Cache the result for the session.

### Chaining
Workflow tools are accessed via a second chained MCP server (e.g. `@umbraco-cms/mcp-workflow`), separate from the core `cms` chain. Both go through the Management API but are separate MCP servers:

```
Editor MCP
├── cms chain      → @umbraco-cms/mcp-dev     (content, media, etc.)
└── workflow chain  → @umbraco-cms/mcp-workflow (approval, review, etc.)
```

The `workflow` chain is optional — if it fails to connect or isn't configured, the editor MCP falls back to direct operations.

### Behaviour When Workflow Is Available
- **Publish** submits content for approval rather than publishing directly
- Tool responses reflect the workflow state ("Submitted for approval" instead of "Published")
- Additional tools conditionally register: `check-approval-status`, `list-pending-approvals`

### Behaviour When Workflow Is Not Available
- **Publish** publishes directly as normal
- Workflow-specific tools are not registered

### Principle
The same tool (`publish-page`) handles both paths. The editor says "publish this" and the tool does the right thing for that instance. This is a cross-cutting concern built into Phase 1, not a separate phase.

## Phases

| Phase | Focus | Collections | Tier Mix |
|-------|-------|------------|----------|
| **1** | Foundation + Content core | content, publishing, versioning | Workflow + Utility |
| **2** | Media + Blueprints | media, blueprints | Workflow + Utility |
| **3** | Translation + Tags | translation, tags | Workflow + Utility |
| **4** | Health + SEO + Reporting | health, seo, reporting | Mostly Utility |
| **5** | Redirects + Search | redirects, search | Utility + Workflow |
| **6** | Bulk operations | bulk-operations (cross-domain) | Workflow-heavy |
| **7** | Members + Scheduling | members, scheduling | Workflow + Utility |

### Phase 1 Detail

Phase 1 establishes the foundation patterns that all subsequent phases build on:

- **Chaining setup** — configure mcpClientManager to call dev MCP tools internally
- **Elicitation patterns** — establish reusable patterns for disambiguation, wizards, and confirmation
- **Safety layer** — write confirmation, schema blocking, dry run support
- **Workflow detection** — detect Umbraco Workflow on the instance, adapt publish behaviour transparently
- **Content CRUD workflow** — create page (draft → validate → publish/submit), edit page, delete page
- **Publishing workflow** — publish/unpublish with confirmation (or submit for approval if Workflow installed)
- **Version history** — list versions, view version, rollback with confirmation
- **Content search/browse** — utility tools for finding and listing content
- **Both entry points** — stdio and hosted worker registering the same collections
- **Integration tests** — test tool handlers against real Umbraco instance
- **Eval tests** — LLM-based acceptance tests for editor workflows

### Phase Dependencies

- Phase 6 (bulk operations) depends on patterns from Phases 1-5
- All phases depend on Phase 1 foundation (chaining, elicitation, safety layer)
- Phases 2-5 are relatively independent and could be reordered based on priority

## Inspiration

Feature ideas informed by feedback from Simon Antony (Umbraco Silver Partner Agency, Dec 2025):

- Content health/auditing (missing meta, alt text, stale content, broken media)
- Bulk operations with safeguards (update properties across pages, re-tag, re-categorise)
- Multi-language support (draft translations, missing translations, sync)
- Reporting for non-technical users ("show me everything published this month")
- Production safety: read = fine, write = preview/approve, schema = off limits
- Dry run mode showing what would change

Agency pitch: "We connect AI to your CMS to keep your content healthy, find problems before your customers do, and handle bulk updates that would take your team days."
