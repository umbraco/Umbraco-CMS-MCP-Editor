# Existing Tools Validation Against UI

> **This is a snapshot, not a task.** It was the original overview that drove the numbered `explore/` reports. The folder structure (`completed/` · `in-progress/` · `to-do/` · `out-of-scope/`) is now the authoritative view of status. The tables and priority rankings below were written before several items shipped or were re-scoped, and they are not maintained — treat them as historical context only.

## Summary of UI vs Tool Coverage

### Content Entity Actions
| UI Action | MCP Tool | Status |
|-----------|----------|--------|
| Create... | `create-page` | ✅ Covered |
| Trash... | `delete-page` | ✅ Covered |
| Create Document Blueprint... | `create-blueprint` | ✅ Covered |
| Move to... | `bulk-move` | ✅ Covered (bulk version) |
| Publish... | `publish-page` | ✅ Covered |
| Duplicate to... | — | ❌ Missing |
| Unpublish... | `unpublish-page` | ✅ Covered |
| Rollback... | `rollback-page` | ✅ Covered |
| Culture and Hostnames... | — | ❌ Missing |
| Public Access... | — | ❌ Missing |
| Sort children... | — | ❌ Missing |
| Notifications... | — | ⏭ Skip (user preference, not editorial) |
| Reload children | — | ⏭ Skip (UI-only, no API equivalent) |

### Content Footer Actions
| UI Action | MCP Tool | Status |
|-----------|----------|--------|
| Save | `edit-page` | ✅ Covered |
| Save and publish | — | ❌ Missing (requires 2 tool calls) |
| Save and preview | — | ❌ Missing (see report 008) |
| Schedule publish | `schedule-publish` | ✅ Covered |
| Publish with descendants | `publish-page` (includeDescendants) | ✅ Covered |
| Unpublish | `unpublish-page` | ✅ Covered |

### Content Workspace Views
| UI View | MCP Tool | Status |
|---------|----------|--------|
| Content (properties) | `get-page`, `edit-page` | ✅ Covered |
| Versions | `list-versions`, `rollback-page` | ✅ Covered |
| Workflow | — | ⏭ Skip (external package) |
| Info > Links | `get-publish-status` | ✅ Partial |
| Info > Referenced by | — | ❌ Missing (inbound refs) |
| Info > History | — | ❌ Missing (audit log) |
| Info > General | `get-page` | ✅ Covered |

### Media Entity Actions
| UI Action | MCP Tool | Status |
|-----------|----------|--------|
| Create... | `create-media-folder`, `upload-media` | ✅ Covered |
| Trash... | `delete-media` | ✅ Covered |
| Move to... | `move-media`, `bulk-move-media` | ✅ Covered |
| Sort children... | — | ❌ Missing |
| Reload children | — | ⏭ Skip (UI-only) |

### Media Item Properties
| UI Property | MCP Tool | Status |
|-------------|----------|--------|
| Image upload/replace | `upload-media` | ✅ Covered |
| Width/Height/Size | `get-media` | 🐛 Broken (validation error) |
| Alt Text (edit) | — | ❌ Missing |
| Info > Referenced by | — | ❌ Missing |
| Info > History | — | ❌ Missing |

### Member Features
| UI Feature | MCP Tool | Status |
|------------|----------|--------|
| List members | `search-members` | ✅ Covered |
| Create member | `create-member` | ✅ Covered |
| Edit member | `update-member` | ✅ Partial (check group assignment) |
| Delete member | `delete-member` | ✅ Covered |
| Member groups | `list-member-groups`, `create-member-group` | ✅ Covered |
| Assign to group | — | ❓ Check if update-member handles this |
| Lock/unlock account | — | ❓ Check if update-member handles this |
| Password reset | — | ❓ Check if API supports this |
| Membership tab details | — | ❓ Needs verification |

### Recycle Bin
| UI Feature | MCP Tool | Status |
|------------|----------|--------|
| List trashed content | — | ❌ Missing |
| Restore content | — | ❌ Missing |
| List trashed media | — | ❌ Missing |
| Restore media | `restore-media` | ✅ Covered |

## Priority Rankings

### High Priority (build these)
1. **save-and-publish** — most common editorial action (report 001)
2. **get-media bug fix** — core tool is broken (report 014)
3. **edit-media** — alt text editing, accessibility (report 012)
4. **restore-page** — content recovery (report 011)

### Medium Priority
5. **duplicate-page** — common workflow (report 002)
6. **sort-children** — content/media ordering (report 003)
7. **get-page-history** — audit log (report 010)
8. **get-media-references** — media usage tracking (report 006)
9. **list-recycle-bin** — recycle bin visibility (report 011)
10. **get-inbound-references** — content dependency tracking (report 013)

### Low Priority
11. **culture-and-hostnames** — multi-site config (report 004)
12. **public-access** — member restrictions (report 005)
13. **get-preview-url** — convenience (report 008)
14. **member-group-assignment** — if not already in update-member (report 015)

### Do NOT Build
- Content Notifications (user preference, not editorial)
- Reload children (UI-only action)
