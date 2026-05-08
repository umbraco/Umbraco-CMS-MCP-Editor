# MCP live-validation audit

A working folder for live-MCP audits run via the `audit-tool` skill. **Not** committed to git (`docs/audits/` is gitignored) — this is a scratchpad for in-flight findings, not a deliverable. Once the audit campaign closes, the durable record is the regression tests + git history; this folder can be deleted.

## Why

Integration tests run against a real Umbraco but call `tool.handler(...)` directly, bypassing the MCP transport's output-schema validation. So a tool can pass every integration test and still fail at the wire boundary (`-32602` errors, response masking, transport timeouts). This audit covers that gap by exercising tools live through the MCP that real users hit, then capturing what's actually broken.

## How to read this folder

- `results.md` — table, one row per tool. Status legend: `–` not yet run · ✅ pass · ❌ fail · ⚠️ wrong-but-not-erroring · ⏭ deferred (with reason)
- `failures/<tool-name>.md` — per-failure detail file with full reproduction recipe. Linked from the row in `results.md`.

## Methodology

See `.claude/skills/audit-tool/SKILL.md` — the full per-tool procedure (prerequisites, fixture-first rule, post-state verification, classification, recording, cleanup) lives there. This README just frames the working folder.
