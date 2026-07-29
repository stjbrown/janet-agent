import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  conformanceScriptPath,
  formatConformanceReport,
  runConformanceCheck,
} from "../src/conformance.js";

const roots: string[] = [];

function temporaryRoot(prefix = "janet-conformance-"): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("deterministic conformance adapter", () => {
  it("runs a conformant bundle and preserves report formatting", () => {
    const bundle = temporaryRoot("janet conformant bundle ");
    writeFileSync(join(bundle, "index.md"), "# Knowledge\n");

    const result = runConformanceCheck(bundle);

    expect(result.exitCode).toBe(0);
    if (result.exitCode === 2) throw new Error(result.error);
    expect(result.report.errors).toEqual([]);
    expect(formatConformanceReport(result.report)).toContain("=> CONFORMANT (0 errors");
  });

  it("preserves nonconformant status 1", () => {
    const bundle = temporaryRoot();
    writeFileSync(join(bundle, "broken.md"), "# Missing frontmatter\n");

    const result = runConformanceCheck(bundle);

    expect(result.exitCode).toBe(1);
    if (result.exitCode === 2) throw new Error(result.error);
    expect(result.report.errors).toHaveLength(1);
  });

  it("fails closed when the checker is absent", () => {
    const bundle = temporaryRoot();
    const result = runConformanceCheck(bundle, join(bundle, "missing-checker.mjs"));
    expect(result).toMatchObject({ exitCode: 2 });
  });

  it("fails closed on malformed JSON", () => {
    const root = temporaryRoot();
    const checker = join(root, "malformed.mjs");
    writeFileSync(checker, 'process.stdout.write("not json");\n');

    expect(runConformanceCheck(root, checker)).toEqual({
      exitCode: 2,
      error: "Conformance checker returned malformed JSON",
    });
  });

  it("passes paths as arguments without shell interpolation", () => {
    const root = temporaryRoot();
    const bundle = join(root, "bundle; false");
    mkdirSync(bundle);
    writeFileSync(join(bundle, "index.md"), "# Knowledge\n");

    const result = runConformanceCheck(bundle, conformanceScriptPath());

    expect(result.exitCode).toBe(0);
  });
});
