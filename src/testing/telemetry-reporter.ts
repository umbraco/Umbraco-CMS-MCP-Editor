/**
 * Jest Custom Reporter — logs per-suite timing to help identify slow suites.
 */

import type { Reporter, TestResult, AggregatedResult } from "@jest/reporters";

class TelemetryReporter implements Pick<Reporter, "onTestResult" | "onRunComplete"> {
  onTestResult(_test: any, testResult: TestResult) {
    const duration = testResult.perfStats.end - testResult.perfStats.start;
    const name = testResult.testFilePath.replace(/.*__tests__\//, "");
    const status = testResult.numFailingTests > 0 ? "FAIL" : "PASS";
    const tests = testResult.numPassingTests + testResult.numFailingTests;
    process.stderr.write(
      `[suite] ${status} ${name} — ${tests} tests, ${Math.round(duration)}ms\n`
    );
  }

  onRunComplete(_testContexts: any, results: AggregatedResult) {
    const total = results.testResults.length;
    const durations = results.testResults.map(r => r.perfStats.end - r.perfStats.start);
    const totalTime = durations.reduce((a, b) => a + b, 0);
    const avgTime = totalTime / total;

    const sorted = results.testResults
      .map(r => ({
        name: r.testFilePath.replace(/.*__tests__\//, ""),
        duration: r.perfStats.end - r.perfStats.start,
      }))
      .sort((a, b) => b.duration - a.duration);

    process.stderr.write("\n========== SUITE TIMING SUMMARY ==========\n");
    process.stderr.write(`Total suites: ${total}\n`);
    process.stderr.write(`Total suite time: ${Math.round(totalTime)}ms (${(totalTime / 1000).toFixed(1)}s)\n`);
    process.stderr.write(`Average suite: ${Math.round(avgTime)}ms\n`);
    process.stderr.write("\nTop 15 slowest suites:\n");
    for (const s of sorted.slice(0, 15)) {
      process.stderr.write(`  ${Math.round(s.duration).toString().padStart(6)}ms  ${s.name}\n`);
    }
    process.stderr.write("==========================================\n");
  }
}

export default TelemetryReporter;
