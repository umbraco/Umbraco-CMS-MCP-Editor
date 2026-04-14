/**
 * Test Telemetry — instruments MCP client calls to measure timing.
 *
 * Wraps mcpClientManager.callTool to log:
 * - Each CMS call with tool name, duration, and success/error
 * - Per-suite summaries (total calls, total time, slowest call)
 * - Connection lifecycle (first connect, reconnects)
 *
 * Enable by importing this file in jest.setup.ts.
 * Output goes to stderr so it doesn't interfere with Jest output.
 */

import { mcpClientManager } from "../umbraco-api/mcp-client.js";

interface CallRecord {
  tool: string;
  duration: number;
  error: boolean;
  timestamp: number;
}

const calls: CallRecord[] = [];
let suiteStart = 0;
let currentSuite = "";
let firstCallTime = 0;
let connectCount = 0;

const originalCallTool = mcpClientManager.callTool.bind(mcpClientManager);

mcpClientManager.callTool = async function(serverName: string, toolName: string, args?: Record<string, unknown>) {
  const start = performance.now();
  if (!firstCallTime) {
    firstCallTime = start;
    log(`[telemetry] First CMS call at ${Math.round(start)}ms`);
  }

  let error = false;
  try {
    const result = await originalCallTool(serverName, toolName, args ?? {});
    error = !!result.isError;
    return result;
  } catch (e) {
    error = true;
    throw e;
  } finally {
    const duration = performance.now() - start;
    calls.push({ tool: `${serverName}.${toolName}`, duration, error, timestamp: start });

    if (duration > 1000) {
      log(`[telemetry] SLOW ${serverName}.${toolName} ${Math.round(duration)}ms${error ? " ERROR" : ""}`);
    }
  }
} as typeof mcpClientManager.callTool;

// Wrap connect to track connection events
const originalConnect = (mcpClientManager as any).connect?.bind(mcpClientManager);
if (typeof originalConnect === "function") {
  (mcpClientManager as any).connect = async function(serverName: string) {
    connectCount++;
    const start = performance.now();
    log(`[telemetry] Connecting to ${serverName} (#${connectCount})...`);
    const result = await originalConnect(serverName);
    log(`[telemetry] Connected to ${serverName} in ${Math.round(performance.now() - start)}ms`);
    return result;
  };
}

function log(msg: string) {
  process.stderr.write(msg + "\n");
}

// Print summary at process exit
process.on("beforeExit", () => {
  if (calls.length === 0) return;

  const totalDuration = calls.reduce((sum, c) => sum + c.duration, 0);
  const errorCalls = calls.filter(c => c.error).length;
  const slowCalls = calls.filter(c => c.duration > 1000).length;

  // Group by tool
  const byTool = new Map<string, { count: number; totalMs: number; maxMs: number }>();
  for (const call of calls) {
    const existing = byTool.get(call.tool) || { count: 0, totalMs: 0, maxMs: 0 };
    existing.count++;
    existing.totalMs += call.duration;
    existing.maxMs = Math.max(existing.maxMs, call.duration);
    byTool.set(call.tool, existing);
  }

  log("\n========== TEST TELEMETRY SUMMARY ==========");
  log(`Total CMS calls: ${calls.length}`);
  log(`Total CMS time: ${Math.round(totalDuration)}ms (${(totalDuration / 1000).toFixed(1)}s)`);
  log(`Average call: ${Math.round(totalDuration / calls.length)}ms`);
  log(`Error calls: ${errorCalls}`);
  log(`Slow calls (>1s): ${slowCalls}`);
  log(`Connection count: ${connectCount}`);
  log("");
  log("Top 10 slowest tool types:");

  const sorted = [...byTool.entries()].sort((a, b) => b[1].totalMs - a[1].totalMs);
  for (const [tool, stats] of sorted.slice(0, 10)) {
    log(`  ${tool}: ${stats.count} calls, total ${Math.round(stats.totalMs)}ms, avg ${Math.round(stats.totalMs / stats.count)}ms, max ${Math.round(stats.maxMs)}ms`);
  }

  log("");
  log("Top 10 individual slowest calls:");
  const slowest = [...calls].sort((a, b) => b.duration - a.duration).slice(0, 10);
  for (const call of slowest) {
    log(`  ${call.tool}: ${Math.round(call.duration)}ms${call.error ? " ERROR" : ""}`);
  }
  log("=============================================\n");
});

export {};
