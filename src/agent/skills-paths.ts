/**
 * Workspace-skills mounting.
 *
 * Mastra workspace `skills` paths must be RELATIVE to the workspace root
 * (LocalFilesystem basePath) — absolute paths are rejected with "path is
 * outside the workspace". Janet's portable kb-* skills ship inside the npm
 * package, outside any user project, so we mount them into the project by
 * SYMLINKING each skill dir into `<project>/.agent-knowledge/skills/` and
 * configuring the workspace with that relative root.
 *
 * Janet's bundled skill suite is authoritative. Generic project/user skill
 * installs can be older than Janet and must not create a mixed-version suite.
 * A real skill directory deliberately placed in the project-local mount is
 * left untouched as an explicit per-project override.
 */
import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR_NAME, bundledSkillsDir, ensureDir } from "./paths.js";

/** Portable skills exposed through Janet's workspace. */
const WORKSPACE_SKILL_NAMES = [
  "kb",
  "kb-init",
  "kb-ingest",
  "kb-document",
  "kb-query",
  "kb-lint",
  "kb-visualize",
];

function isSkillDir(dir: string): boolean {
  return fs.existsSync(path.join(dir, "SKILL.md"));
}

export interface SkillMount {
  /** Workspace `skills` entry — relative to the workspace root. */
  relativeRoot: string;
  /** Absolute dirs the filesystem must allow reads from (symlink targets). */
  allowedPaths: string[];
}

/**
 * Ensure Janet's project-local skill links exist and return the
 * workspace-relative skills root plus the absolute paths reads must be allowed
 * to resolve through.
 */
export function ensureSkillLinks(projectPath: string): SkillMount {
  const bundled = bundledSkillsDir();

  const linkRoot = path.join(projectPath, CONFIG_DIR_NAME, "skills");
  ensureDir(linkRoot);
  const allowedPaths = new Set<string>([linkRoot]);

  for (const name of WORKSPACE_SKILL_NAMES) {
    const dest = path.join(linkRoot, name);

    let st: fs.Stats | undefined;
    try {
      st = fs.lstatSync(dest);
    } catch {
      st = undefined;
    }

    if (st && !st.isSymbolicLink()) {
      if (isSkillDir(dest)) allowedPaths.add(dest);
      continue;
    }

    const src = path.join(bundled, name);
    if (!isSkillDir(src)) continue;
    allowedPaths.add(src);

    if (st?.isSymbolicLink()) {
      // Repoint a stale link (e.g. package moved between installs).
      if (fs.readlinkSync(dest) !== src) {
        fs.unlinkSync(dest);
        fs.symlinkSync(src, dest, "dir");
      }
    } else if (!st) {
      fs.symlinkSync(src, dest, "dir");
    }
  }

  return {
    relativeRoot: path.join(CONFIG_DIR_NAME, "skills"),
    allowedPaths: [...allowedPaths],
  };
}
