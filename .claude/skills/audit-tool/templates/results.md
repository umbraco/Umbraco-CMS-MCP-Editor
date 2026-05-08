# Live-validation results

Status legend: `–` not yet run · ✅ pass · ❌ fail · ⚠️ wrong-but-not-erroring · ⏭ deferred (with reason)

Last updated: <!-- YYYY-MM-DD -->

## Summary (in-progress)

- Total tools: <!-- N -->
- Tested: <!-- N -->
- Passing: <!-- N -->
- Failing (hard error / 100% repro): <!-- N -->
- Wrong-but-not-erroring: <!-- N -->
- Deferred: <!-- N -->

## Tools

Group rows by collection. One row per tool. Add a Detail link only for ❌ / ⚠️ rows.

### <!-- collection name -->

| Tool | Destructive | Status | Summary | Detail |
|------|-------------|--------|---------|--------|
| `tool-name` | yes/no | – | | |

## Notes

- Fixtures created during the audit must be cleaned up before closing — the demo site should round-trip clean.
- Per-failure files live in `failures/<tool-name>.md` — see the failure-file template in this skill folder for the format.
- Once every row has a status and every ❌ / ⚠️ has a corresponding detail file, the audit is "complete" — the durable record is the regression tests + git history, and this folder can be deleted.
