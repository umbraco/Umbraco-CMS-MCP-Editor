# `<tool-name>` — <one-line symptom>

- **Tool**: `<collection>/<tool-name>`
- **Source**: `src/umbraco-api/tools/<collection>/<verb>/<tool-name>.ts`
- **Status**: ❌ Failed / ⚠️ Wrong but didn't error

## Live call inputs

```json
{ }
```

Any prerequisites (fixture state, what was just published, etc.).

## Expected outcome

What should have happened — informed by the tool's description and integration-test intent.

## Actual outcome

```
<verbatim error or response, plus post-state from re-reading via a different tool>
```

## Reproducibility

Always / Intermittent / Once-only — and the retry count.

## Suspected cause

Short paragraph linking the observed symptom to a likely region of code (chained tool's response shape, schema mismatch, transport timeout, missing CMS server registration, etc.). Hypothesis, not diagnosis.

## Repro recipe

```text
1. <minimum sequence of MCP calls another agent could replay>
2. ...
```

## Notes for fix campaign

Severity, scope of impact, integration-test gap that let it ship, related tools likely affected by the same root cause.
