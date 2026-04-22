# Protect Important Versions

## The Editor's Problem

Umbraco automatically cleans up old content versions to save database space. But sometimes editors want to preserve specific versions — the "before rebrand" snapshot, the "original launch version", or the "pre-legal-review" state. In the UI, version protection is buried in the version history with no easy way to manage it.

The API has `PUT /document-version/{id}/prevent-cleanup` which can mark specific versions as protected from automatic cleanup.

## What This Enables

**"Protect the current version before I make big changes"** — Bookmark the current state so the editor can always roll back.

**"Which versions are protected?"** — List all protected versions across pages.

**"We're about to rebrand. Snapshot all published pages."** — Protect the current published version of every page so there's a reliable rollback point.

## API Endpoints Used

- `GET /document-version` — list versions with cleanup prevention status
- `GET /document-version/{id}` — get specific version details
- `PUT /document-version/{id}/prevent-cleanup` — toggle protection

## Proposed Tool: `protect-version`

**Input:**
- `id` (uuid) — page ID
- `versionId` (uuid, optional) — specific version to protect, or latest if omitted
- `protect` (boolean, default true) — protect or unprotect

**Output:**
- Version protected/unprotected confirmation
- Version details: date, user, summary

## Editor Story

> "I'm about to completely rewrite the homepage. Can you save the current version so I can roll back if needed?"

The LLM gets the current version ID, marks it as protected, and confirms: "Protected version from April 10, 2026. You can roll back to this at any time, and it won't be cleaned up automatically."
