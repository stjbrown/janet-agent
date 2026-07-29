import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveProjectPaths } from "../src/agent/paths.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("resolveProjectPaths", () => {
  it("defaults to the knowledge directory in the selected project", () => {
    const project = mkdtempSync(join(tmpdir(), "janet-paths-default-"));
    roots.push(project);
    expect(resolveProjectPaths({ dir: project }).bundlePath).toBe(join(project, "knowledge"));
  });

  it("resolves a bundle within the selected project", () => {
    const project = mkdtempSync(join(tmpdir(), "janet-paths-"));
    roots.push(project);
    expect(resolveProjectPaths({ dir: project, bundle: "docs/kb" }).bundlePath).toBe(
      join(project, "docs", "kb"),
    );
  });

  it("accepts an absolute bundle path within the selected project", () => {
    const project = mkdtempSync(join(tmpdir(), "janet-paths-absolute-"));
    roots.push(project);
    const bundle = join(project, "docs", "kb");
    expect(resolveProjectPaths({ dir: project, bundle }).bundlePath).toBe(bundle);
  });

  it("rejects a bundle outside the project sandbox", () => {
    const root = mkdtempSync(join(tmpdir(), "janet-paths-outside-"));
    roots.push(root);
    const project = join(root, "project");
    const outside = join(root, "outside");
    mkdirSync(project);
    mkdirSync(outside);
    expect(() => resolveProjectPaths({ dir: project, bundle: outside })).toThrow(
      /Bundle path must be inside the project workspace/,
    );
  });
});
