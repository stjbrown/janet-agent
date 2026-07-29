import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { bundledSkillsDir } from "./agent/paths.js";

export interface ConformanceReport {
  bundle: string;
  concepts: number;
  files: number;
  errors: string[];
  warnings: string[];
}

export type ConformanceResult =
  | { exitCode: 0 | 1; report: ConformanceReport }
  | { exitCode: 2; error: string };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseReport(stdout: string): ConformanceReport | undefined {
  let value: unknown;
  try {
    value = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (
    typeof value !== "object" ||
    value === null ||
    !("bundle" in value) ||
    typeof value.bundle !== "string" ||
    !("concepts" in value) ||
    !Number.isInteger(value.concepts) ||
    (value.concepts as number) < 0 ||
    !("files" in value) ||
    !Number.isInteger(value.files) ||
    (value.files as number) < 0 ||
    !("errors" in value) ||
    !isStringArray(value.errors) ||
    !("warnings" in value) ||
    !isStringArray(value.warnings)
  ) {
    return undefined;
  }
  return value as ConformanceReport;
}

export function conformanceScriptPath(): string {
  return join(bundledSkillsDir(), "kb-lint", "scripts", "conformance.mjs");
}

export function runConformanceCheck(
  bundlePath: string,
  checkerPath = conformanceScriptPath(),
): ConformanceResult {
  const result = spawnSync(process.execPath, [checkerPath, bundlePath, "--json"], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
    windowsHide: true,
  });

  if (result.error) return { exitCode: 2, error: result.error.message };
  if (result.signal) {
    return { exitCode: 2, error: `Conformance checker terminated by ${result.signal}` };
  }
  if (result.status === 2) {
    return {
      exitCode: 2,
      error: result.stderr.trim() || "Conformance checker reported an operational error",
    };
  }
  if (result.status !== 0 && result.status !== 1) {
    return {
      exitCode: 2,
      error: `Conformance checker returned unexpected status ${String(result.status)}`,
    };
  }

  const report = parseReport(result.stdout);
  if (!report) return { exitCode: 2, error: "Conformance checker returned malformed JSON" };
  if ((result.status === 0) !== (report.errors.length === 0)) {
    return { exitCode: 2, error: "Conformance checker status disagrees with its report" };
  }
  return { exitCode: result.status, report };
}

export function formatConformanceReport(report: ConformanceReport): string {
  const lines = [`${report.bundle}: ${report.files} files, ${report.concepts} concepts`];
  for (const error of report.errors) lines.push(`  ERROR  ${error}`);
  for (const warning of report.warnings) lines.push(`  warn   ${warning}`);
  const verdict = report.errors.length === 0 ? "CONFORMANT" : "NON-CONFORMANT";
  lines.push(
    `  => ${verdict} (${report.errors.length} errors, ${report.warnings.length} warnings)`,
  );
  return lines.join("\n");
}
