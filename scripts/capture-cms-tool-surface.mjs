#!/usr/bin/env node

/**
 * Capture the FULL chained-CMS tool surface of the installed @umbraco-cms/mcp-dev.
 *
 * Why this exists: the /upgrade-umbraco diff must see EVERY tool the new package
 * exposes. Tool visibility is gated by the caller's permissions (allowedSections
 * + fallbackPermissions), so a hardcoded permission list silently drops any tool
 * behind a section or permission family that a NEW Umbraco major introduces. That
 * is exactly how the Umbraco 18 "Elements" domain (new `Umb.Section.Library`
 * section + `Umb.Element.*` permissions, 46 tools) was missed on a first pass.
 *
 * This script derives a permission-COMPLETE user from the installed package's own
 * dist — every `Umb.Section.*` and every `Umb.<Entity>.<Permission>` string it
 * references — so nothing is ever filtered out, regardless of what a future major
 * adds. Run it once before the version bump and once after; diff the outputs.
 *
 * KNOWN BLIND SPOT — version-gated tools (isUmbracoAtLeast): some tools are
 * gated at runtime by the connected Umbraco instance's version (e.g. new tools
 * for endpoints introduced mid-line, gated so they 404 on older instances of
 * the same major). That gate is a module-private variable
 * (`umbracoVersion`/`setUmbracoVersion`) only ever set inside the package's own
 * `main()` during a REAL server bootstrap (`client.getServerInformation()`
 * against a live, authenticated Umbraco connection) — it is never exported, so
 * this script's static `import("@umbraco-cms/mcp-dev/collections")` can NEVER
 * see tools gated this way; they silently read as absent regardless of the
 * synthetic permission-complete user above. This is exactly how 7 new tools
 * (create-and-publish-document, sort-document-children, etc., gated behind
 * `isUmbracoAtLeast(17, 6)`) were missed diffing 17.6.2 -> 17.6.3 despite this
 * script reporting zero change. Mitigation: this script counts
 * `isUmbracoAtLeast(` call sites in the dist and warns loudly on stderr when
 * present — treat that warning as "cross-check the package's own CHANGELOG /
 * GitHub release notes for new tools before trusting a zero-diff result."
 *
 * Usage:
 *   node scripts/capture-cms-tool-surface.mjs <output-prefix>
 *
 * Writes three files (sorted, newline-delimited, stable for `comm`/`diff`):
 *   <output-prefix>.tools.txt         — every tool name
 *   <output-prefix>.sections.txt      — every Umb.Section.* the package references
 *   <output-prefix>.permfamilies.txt  — every Umb.<Entity> permission family (e.g. Umb.Element)
 *
 * Prints a one-line summary to stderr (counts) so a silent-filter regression is obvious.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const prefix = process.argv[2];
if (!prefix) {
  console.error("Usage: node scripts/capture-cms-tool-surface.mjs <output-prefix>");
  process.exit(1);
}

// Resolve the installed package's collections entry (ESM-only export) + its dist dir.
const collectionsUrl = import.meta.resolve("@umbraco-cms/mcp-dev/collections");
const distDir = dirname(fileURLToPath(collectionsUrl));

// Scrape every section + permission string the package defines/references.
const src = readdirSync(distDir)
  .filter((f) => f.endsWith(".js"))
  .map((f) => readFileSync(`${distDir}/${f}`, "utf8"))
  .join("\n");

const sections = [...new Set(src.match(/Umb\.Section\.[A-Za-z]+/g) ?? [])].sort();
const permissions = [
  ...new Set((src.match(/Umb\.[A-Za-z]+\.[A-Za-z]+/g) ?? []).filter((s) => !s.startsWith("Umb.Section."))),
].sort();
const permFamilies = [...new Set(permissions.map((p) => p.split(".").slice(0, 2).join(".")))].sort();

// A permission-COMPLETE user: every section, every permission the package knows.
const user = {
  allowedSections: sections,
  fallbackPermissions: permissions,
  userGroupIds: [{ id: "e5e7f6c8-7f9c-4b5b-8d5d-9e1e5a4f7e4d" }],
};

const { collections } = await import(collectionsUrl);
const names = new Set();
for (const c of collections) {
  const tools = typeof c.tools === "function" ? c.tools(user) : c.tools;
  for (const t of tools) names.add(t.name);
}
const toolNames = [...names].sort();

writeFileSync(`${prefix}.tools.txt`, toolNames.join("\n") + "\n");
writeFileSync(`${prefix}.sections.txt`, sections.join("\n") + "\n");
writeFileSync(`${prefix}.permfamilies.txt`, permFamilies.join("\n") + "\n");

console.error(
  `captured ${toolNames.length} tools | ${sections.length} sections | ${permFamilies.length} permission families -> ${prefix}.*.txt`,
);

// Surface the static-capture blind spot described above: version-gated tools
// are invisible here no matter how complete the synthetic user is.
const versionGates = [...new Set(src.match(/isUmbracoAtLeast\(\s*\d+\s*,\s*\d+\s*\)/g) ?? [])].sort();
if (versionGates.length > 0) {
  writeFileSync(`${prefix}.versiongates.txt`, versionGates.join("\n") + "\n");
  console.error(
    `\nWARNING: ${versionGates.length} isUmbracoAtLeast(...) gate(s) found in this package's dist ` +
    `(${versionGates.join(", ")}). Tools behind these gates are INVISIBLE to this script's static ` +
    `capture regardless of the diff result above — the gate is only ever set during a real, ` +
    `authenticated server bootstrap. Cross-check the package's CHANGELOG / GitHub release notes ` +
    `for new tools before trusting a zero-diff result.`,
  );
}
