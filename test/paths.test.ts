import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  prepareAppDataDir,
  resolveProjectPaths,
} from "../src/agent/paths.js";

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

  it("migrates legacy global state without overwriting a current directory", () => {
    const home = mkdtempSync(join(tmpdir(), "janet-paths-migration-"));
    roots.push(home);
    const legacy = join(home, ".agent-knowledge");
    const current = join(home, ".janet");
    mkdirSync(legacy);
    writeFileSync(join(legacy, "settings.json"), "{}");

    expect(prepareAppDataDir(home)).toBe(true);
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(join(current, "settings.json"))).toBe(true);
    expect(statSync(current).mode & 0o777).toBe(0o700);
    expect(statSync(join(current, "settings.json")).mode & 0o777).toBe(0o600);

    mkdirSync(legacy);
    expect(prepareAppDataDir(home)).toBe(false);
    expect(existsSync(legacy)).toBe(true);
  });
});
