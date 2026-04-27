# Public Access (Content Restriction)

## Problem

The Umbraco UI has a **"Public Access..."** entity action on content nodes. This allows editors to restrict access to pages, requiring visitors to log in (as members) to view content. This is used for:
- Member-only content areas
- Premium content behind a paywall
- Restricted sections (e.g. internal documents)

We have **no equivalent tool** for managing public access restrictions.

## UI Workflow (Reproduction Steps)

1. Navigate to Content section
2. Open a content node
3. Click the **"..."** (entity actions menu)
4. Select **"Public Access..."**
5. A dialog appears with options:
   - **Single member login** — restrict to a specific member
   - **Member group access** — restrict to members of specific groups
   - **Login page** — which page to redirect unauthenticated visitors to
   - **Error page** — which page to show for unauthorized access
6. Save the access rules

## Proposed Tools: `get-public-access` / `set-public-access` / `remove-public-access`

### Read tool:
**Input:** `id` (uuid) — content node ID  
**Output:** Current access rules (member groups, login page, error page), or "no restrictions"

### Write tool:
**Input:**
- `id` (uuid) — content node ID
- `memberGroupNames` (array of string) — allowed member groups
- `loginPageId` (uuid) — redirect page for login
- `errorPageId` (uuid) — page shown on access denied

### Remove tool:
**Input:** `id` (uuid) — content node ID  
**Behaviour:** Remove all access restrictions, making the page public

**Why this matters:**
- Combines content and member management — an LLM could set up restricted areas in one conversation
- "Make the Premium Articles section only visible to Gold members" is a natural editorial request
- Useful for auditing: "Which pages have access restrictions?"
- Cross-references member groups, which we already have tools for

## Impact

Medium — important for sites with member areas, less relevant for public-only sites.
