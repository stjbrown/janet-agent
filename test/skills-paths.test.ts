import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { ensureSkillLinks } from "../src/agent/skills-paths.js";

const roots: string[] = [];

function makeSkill(root: string, name: string): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\n---\n`, "utf-8");
  return dir;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("ensureSkillLinks", () => {
  it("uses Janet's bundled suite instead of stale generic agent installs", () => {
    const root = mkdtempSync(join(tmpdir(), "janet-skills-"));
    roots.push(root);
    const project = join(root, "project");
    const home = join(root, "home");
    mkdirSync(project, { recursive: true });
    mkdirSync(home, { recursive: true });

    makeSkill(join(project, ".agents", "skills"), "kb");
    makeSkill(join(home, ".claude", "skills"), "kb-query");
    makeSkill(join(home, ".janet", "skills"), "kb-init");

    const mount = ensureSkillLinks(project);
    const links = join(project, ".janet", "skills");

    for (const name of [
      "kb",
      "kb-init",
      "kb-ingest",
      "kb-document",
      "kb-query",
      "kb-lint",
      "kb-visualize",
    ]) {
      expect(readlinkSync(join(links, name))).toContain(`/skills/${name}`);
    }
    expect(existsSync(join(links, "janet-pdf"))).toBe(false);
    expect(mount.allowedPaths).not.toEqual(
      expect.arrayContaining([
        join(project, ".agents", "skills", "kb"),
        join(home, ".claude", "skills", "kb-query"),
      ]),
    );
  });

  it("preserves a real project-local mounted skill", () => {
    const root = mkdtempSync(join(tmpdir(), "janet-skills-local-"));
    roots.push(root);
    const project = join(root, "project");
    const home = join(root, "home");
    mkdirSync(home, { recursive: true });
    const local = makeSkill(join(project, ".janet", "skills"), "kb");

    const mount = ensureSkillLinks(project);

    expect(mount.allowedPaths).toContain(local);
  });

  it("keeps Janet's local runtime out of Git without editing tracked files", () => {
    const root = mkdtempSync(join(tmpdir(), "janet-skills-git-"));
    roots.push(root);
    const project = join(root, "project");
    mkdirSync(project, { recursive: true });
    execFileSync("git", ["init", "--quiet", project]);

    ensureSkillLinks(project);

    expect(
      execFileSync(
        "git",
        ["-C", project, "check-ignore", "--quiet", "--no-index", ".janet/"],
      ),
    ).toBeDefined();
    expect(existsSync(join(project, ".gitignore"))).toBe(false);
  });
});
