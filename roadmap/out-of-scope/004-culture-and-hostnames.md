# Culture and Hostnames

> **Status:** ❌ Out of scope — hostname/domain/culture config is site-infrastructure, not editorial. Misconfiguration can take a site offline or break routing globally, and the blast radius is too large for an agent or day-to-day editor to safely trigger. Leave this to developers/admins through the CMS backoffice.

## Problem

The Umbraco UI has a **"Culture and Hostnames..."** entity action on content nodes. This allows editors to:
- Assign domain names to content nodes (e.g. `www.example.com` points to the Home node)
- Set the culture/language for a content branch
- Configure multiple domains for multi-site or multi-language setups

We have **no equivalent tool** for managing domains/hostnames on content nodes.

## UI Workflow (Reproduction Steps)

1. Navigate to Content section
2. Open a content node (typically a root-level node like Home)
3. Click the **"..."** (entity actions menu)
4. Select **"Culture and Hostnames..."**
5. A dialog appears showing:
   - Assigned domains (hostname + language)
   - Add/remove domain bindings
   - Default language selection
6. Save changes

## Proposed Tool: `get-culture-and-hostnames` / `set-culture-and-hostnames`

### Read tool:
**Input:** `id` (uuid) — content node ID
**Output:** List of assigned domains with their cultures, default language

### Write tool:
**Input:**
- `id` (uuid) — content node ID  
- `domains` (array of { domain, culture }) — domain bindings
- `defaultCulture` (string, optional) — default culture for this branch

**Why this matters:**
- Essential for multi-site and multi-language Umbraco installations
- Useful for LLM-assisted site setup and configuration
- Could help diagnose "why isn't my site showing in the right language" issues

## Impact

Low-Medium — important for multi-site/multi-language setups but not frequently changed.
