/**
 * Collection Registry Consistency Tests
 *
 * A tool is only reachable by an MCP client if three things line up:
 *
 *   1. its collection is exported from `src/collections.ts` (the single
 *      registry both entry points consume — stdio `index.ts` and the hosted
 *      worker), and
 *   2. some mode in `src/config/mode-registry.ts` names that collection, since
 *      setting `UMBRACO_TOOL_MODES` gates registration by collection, and
 *   3. the collection directory actually exists under `tools/`.
 *
 * Nothing in the type system enforces any of that, and integration tests
 * import tool modules directly — so a collection can be fully built, fully
 * tested, and still invisible on the wire. That is exactly what happened to
 * the `element` collection: it was added to `collections.ts` but omitted from
 * the hand-maintained duplicate list in `index.ts`, so every Library element
 * tool (including `inspect-element-blocks` / `edit-element-block`) was missing
 * from the stdio server while its own tests passed. These tests are the guard.
 */

import { describe, it, expect } from "@jest/globals";
import fs from "fs";
import path from "path";
import { collections } from "../collections.js";
import { toolModes } from "../config/mode-registry.js";

const TOOLS_DIR = path.resolve(process.cwd(), "src/umbraco-api/tools");

/** Not a tool collection — shared code (bulk-handler, tree-walker, ...). */
const NON_COLLECTION_DIRS = new Set(["helpers"]);

/**
 * Collections that exist on disk but are deliberately not registered yet.
 *
 * These are pre-existing gaps, not new ones: both collections are built and
 * unit-tested but appear in neither `collections.ts` nor any mode, so their
 * tools are unreachable from both entry points. That matches the "deferred
 * audits" note in CLAUDE.md — the tree-walking report tools were never
 * live-validated because they were never actually exposed. Fixing them means
 * choosing a mode, wiring the tools into the eval `allTools` arrays, and
 * paying the tree-walk audit cost, so it belongs in its own change.
 *
 * Do NOT add to this list to make a new collection pass. Register it instead.
 */
const KNOWN_UNREGISTERED = new Set(["content-reporting", "media-health"]);

function collectionDirsOnDisk(): string[] {
  return fs
    .readdirSync(TOOLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !NON_COLLECTION_DIRS.has(name))
    .filter((name) => fs.existsSync(path.join(TOOLS_DIR, name, "index.ts")))
    .sort();
}

describe("Collection registry consistency", () => {
  const registeredNames = collections.map((c) => c.metadata.name).sort();
  const modeCollectionNames = [...new Set(toolModes.flatMap((m) => m.collections))].sort();

  it("registers every collection that exists on disk", () => {
    const missing = collectionDirsOnDisk().filter(
      (dir) => !registeredNames.includes(dir) && !KNOWN_UNREGISTERED.has(dir),
    );

    expect(missing).toEqual([]);
  });

  it("has no stale entries in the known-unregistered allowlist", () => {
    // If a collection gets registered, drop it from the allowlist so the
    // allowlist never silently masks a future regression for that name.
    const stale = [...KNOWN_UNREGISTERED].filter((name) => registeredNames.includes(name));

    expect(stale).toEqual([]);
  });

  it("exposes every registered collection through at least one mode", () => {
    // A registered collection that no mode names is unreachable as soon as a
    // user sets UMBRACO_TOOL_MODES, which is the documented way to scope this
    // server.
    const unreachable = registeredNames.filter((name) => !modeCollectionNames.includes(name));

    expect(unreachable).toEqual([]);
  });

  it("only names registered collections in the mode registry", () => {
    // A mode pointing at a collection that is not registered silently
    // contributes no tools, so the mode looks enabled but does nothing.
    const dangling = modeCollectionNames.filter((name) => !registeredNames.includes(name));

    expect(dangling).toEqual([]);
  });

  it("registers the element collection so Library element tools reach clients", () => {
    // Explicit regression test for the drift this suite was written for.
    expect(registeredNames).toContain("element");

    const elementTools = collections
      .filter((c) => c.metadata.name === "element")
      .flatMap((c) => c.tools({}))
      .map((t) => t.name);

    expect(elementTools).toContain("inspect-element-blocks");
    expect(elementTools).toContain("edit-element-block");
  });

  it("registers each collection exactly once", () => {
    const duplicates = registeredNames.filter((name, i) => registeredNames.indexOf(name) !== i);

    expect(duplicates).toEqual([]);
  });
});
