#!/usr/bin/env node
/**
 * kill-orphan-demosites.mjs
 *
 * Finds all running demo-site processes, checks whether each one lives inside
 * an active worktree, and kills the ones that don't.
 *
 * A process is considered an orphan when:
 *   - Its working directory contains `.claude/worktrees/<name>/`
 *   - AND that worktree directory no longer exists on disk
 *
 * Processes whose cwd is elsewhere (project root, /tmp, etc.) are left alone.
 *
 * Usage:
 *   node scripts/kill-orphan-demosites.mjs            # kill orphans
 *   node scripts/kill-orphan-demosites.mjs --dry-run  # list, don't kill
 */

import { execSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");

if (DRY_RUN) {
  console.log("[dry-run] No processes will be killed.\n");
}

// ---------------------------------------------------------------------------
// 1. Find demo-site processes
// ---------------------------------------------------------------------------

/**
 * List running processes whose command or arguments contain "demo-site".
 * Returns an array of { pid, comm, args }.
 *
 * Uses `ps -axwwo pid,comm,args` which works on macOS and Linux.
 */
function findDemoSiteProcesses() {
  let psOutput;
  try {
    // -axww: all users, wide output. -o pid,comm,args: custom columns.
    psOutput = execSync("ps -axwwo pid,comm,args", { encoding: "utf8" });
  } catch {
    console.error("Failed to run ps. Cannot continue.");
    process.exit(1);
  }

  const lines = psOutput.split("\n").slice(1); // skip header
  const results = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    // pid is the first token, comm is the second, args is the rest.
    const match = line.match(/^\s*(\d+)\s+(\S+)\s+(.*)/);
    if (!match) continue;
    const [, pid, comm, args] = match;

    // Filter: must mention "demo-site" in comm or args.
    if (!comm.includes("demo-site") && !args.includes("demo-site")) continue;

    // Exclude the ps command itself and the current node process.
    const pidNum = parseInt(pid, 10);
    if (pidNum === process.pid) continue;

    results.push({ pid: pidNum, comm, args });
  }

  return results;
}

// ---------------------------------------------------------------------------
// 2. Resolve the working directory of a PID via lsof
// ---------------------------------------------------------------------------

/**
 * Returns the cwd of a process as reported by lsof, or null if unavailable.
 *
 * `lsof -a -p <pid> -d cwd -Fn` prints lines like:
 *   p<pid>
 *   n<path>
 *
 * Portable across macOS and Linux (both ship lsof).
 */
function getProcessCwd(pid) {
  try {
    const result = spawnSync(
      "lsof",
      ["-a", "-p", String(pid), "-d", "cwd", "-Fn"],
      { encoding: "utf8", timeout: 5000 }
    );
    if (result.status !== 0 || !result.stdout) return null;

    // Find the line starting with 'n' (name = path).
    for (const line of result.stdout.split("\n")) {
      if (line.startsWith("n")) {
        return line.slice(1).trim() || null;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. Determine whether a cwd is inside a now-missing worktree
// ---------------------------------------------------------------------------

/**
 * Parses `.claude/worktrees/<name>/` out of a path.
 * Returns the worktree directory path, or null if the cwd doesn't follow
 * the worktree convention.
 */
function extractWorktreePath(cwd) {
  if (!cwd) return null;
  const m = cwd.match(/(.*\.claude\/worktrees\/[^/]+)\//);
  if (!m) return null;
  return resolve(m[1]);
}

// ---------------------------------------------------------------------------
// 4. Main
// ---------------------------------------------------------------------------

const procs = findDemoSiteProcesses();

if (procs.length === 0) {
  console.log("No demo-site processes found.");
  process.exit(0);
}

console.log(`Found ${procs.length} demo-site process(es). Checking...\n`);

let killed = 0;
let kept = 0;

for (const { pid, comm, args } of procs) {
  const label = `PID ${pid} (${comm})`;
  const cwd = getProcessCwd(pid);

  if (cwd === null) {
    console.log(`  KEEP   ${label} — could not resolve cwd (process may have exited)`);
    kept++;
    continue;
  }

  const worktreePath = extractWorktreePath(cwd);

  if (worktreePath === null) {
    console.log(`  KEEP   ${label} — cwd is outside .claude/worktrees: ${cwd}`);
    kept++;
    continue;
  }

  if (existsSync(worktreePath)) {
    console.log(`  KEEP   ${label} — worktree still exists: ${worktreePath}`);
    kept++;
    continue;
  }

  // Orphan — worktree is gone.
  if (DRY_RUN) {
    console.log(`  KILL   ${label} — worktree missing: ${worktreePath}  [dry-run, skipping]`);
    killed++;
    continue;
  }

  try {
    process.kill(pid, "SIGTERM");
    console.log(`  KILLED ${label} — worktree missing: ${worktreePath}`);
    killed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  ERROR  ${label} — SIGTERM failed: ${msg}`);
    kept++;
  }
}

console.log(
  `\nDone. ${killed} ${DRY_RUN ? "would-kill" : "killed"}, ${kept} kept.`
);
