#!/usr/bin/env node

/**
 * test-changed.mjs
 *
 * Runs only the integration tests related to the current change, deterministically
 * and with no arguments. Intended as a fast pre-flight for cloud build loops
 * (mcp-issue-loop, rework-loop): validate the change's own test(s) before the PR
 * reaches CI. CI still runs the full suite — this script does not replace it.
 *
 * How it works:
 *   1. Resolve the diff base: origin/${GITHUB_BASE_REF:-dev} (falling back to
 *      origin/main if that ref doesn't exist), then compute the merge-base with HEAD.
 *   2. Find changed source files: `git diff --name-only <merge-base>...HEAD -- 'src/**' '*.ts'` style pathspec (all TypeScript under src/).
 *   3. Run Jest with --findRelatedTests over the changed source files, mirroring
 *      the existing `test:one` invocation. Jest walks the import graph and selects
 *      exactly the tests that import the changed files.
 *   4. Also run any changed `*.test.ts` files directly — a change that only edits
 *      a test file wouldn't otherwise be picked up by --findRelatedTests.
 *   5. If the resulting set of files to test is empty, exit 0 with a clear message
 *      (this is not a failure — e.g. a docs-only change).
 *
 * This script only *selects and runs* tests; it does not start Umbraco itself.
 * Integration tests require a running Umbraco instance with an API user
 * configured (see CLAUDE.md) — start it first with `npm run start:umbraco`.
 *
 * Usage:
 *   node scripts/test-changed.mjs
 */

import { execFileSync, spawnSync } from "node:child_process";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function refExists(ref) {
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", ref], {
    encoding: "utf8",
  });
  return result.status === 0;
}

function resolveBaseRef() {
  const branch = process.env.GITHUB_BASE_REF || "dev";
  const candidate = `origin/${branch}`;
  if (refExists(candidate)) {
    return candidate;
  }
  if (refExists("origin/main")) {
    console.log(
      `test-changed: ${candidate} not found, falling back to origin/main`,
    );
    return "origin/main";
  }
  throw new Error(
    `test-changed: neither ${candidate} nor origin/main exist — cannot resolve a diff base`,
  );
}

function resolveMergeBase(baseRef) {
  return git(["merge-base", baseRef, "HEAD"]);
}

function changedFiles(mergeBase, pathspec) {
  const output = execFileSync(
    "git",
    ["diff", "--name-only", `${mergeBase}...HEAD`, "--", pathspec],
    { encoding: "utf8" },
  );
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function main() {
  const baseRef = resolveBaseRef();
  const mergeBase = resolveMergeBase(baseRef);
  console.log(`test-changed: diffing against ${baseRef} (merge-base ${mergeBase})`);

  const changedSourceFiles = changedFiles(mergeBase, "src/**/*.ts");
  const changedTestFiles = changedSourceFiles.filter((f) => f.endsWith(".test.ts"));
  const changedNonTestFiles = changedSourceFiles.filter(
    (f) => !f.endsWith(".test.ts"),
  );

  if (changedSourceFiles.length === 0) {
    console.log("test-changed: no changed files under src/**/*.ts — no related tests for this change.");
    process.exit(0);
  }

  console.log(`test-changed: changed source files:\n${changedSourceFiles.map((f) => `  ${f}`).join("\n")}`);

  const jestArgs = [
    "--experimental-vm-modules",
    "node_modules/jest/bin/jest.js",
    "--runInBand",
    "--forceExit",
  ];

  // --findRelatedTests walks the import graph for non-test source files; changed
  // test files themselves need to be passed as direct run targets since a test
  // file doesn't "import" itself in a way --findRelatedTests would pick up.
  const filesToTest = [];
  if (changedNonTestFiles.length > 0) {
    filesToTest.push({ mode: "related", files: changedNonTestFiles });
  }
  if (changedTestFiles.length > 0) {
    filesToTest.push({ mode: "direct", files: changedTestFiles });
  }

  let exitCode = 0;

  for (const { mode, files } of filesToTest) {
    const args =
      mode === "related"
        ? [...jestArgs, "--findRelatedTests", ...files]
        : [...jestArgs, ...files];

    console.log(
      `\ntest-changed: running jest (${mode}) for:\n${files.map((f) => `  ${f}`).join("\n")}`,
    );

    const result = spawnSync("node", args, { stdio: "inherit" });
    if (result.status !== 0) {
      exitCode = result.status ?? 1;
    }
  }

  process.exit(exitCode);
}

main();
