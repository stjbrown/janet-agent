#!/usr/bin/env node

import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS_PACKAGE = "@stjbrown/agent-knowledge-skills";
const EXPECTED_SKILLS = [
  "kb",
  "kb-init",
  "kb-ingest",
  "kb-document",
  "kb-query",
  "kb-lint",
  "kb-visualize",
];

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(repoRoot, "skills");
const require = createRequire(import.meta.url);

const janetManifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const declaredVersion = janetManifest.devDependencies?.[SKILLS_PACKAGE];
if (typeof declaredVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(declaredVersion)) {
  throw new Error(`${SKILLS_PACKAGE} must be an exact development dependency`);
}

const packageJsonPath = require.resolve(`${SKILLS_PACKAGE}/package.json`);
const skillsPackageRoot = dirname(packageJsonPath);
const installedManifest = JSON.parse(readFileSync(packageJsonPath, "utf8"));
if (installedManifest.version !== declaredVersion) {
  throw new Error(
    `${SKILLS_PACKAGE} version mismatch: declared ${declaredVersion}, installed ${installedManifest.version}`,
  );
}

const source = join(skillsPackageRoot, "skills");
for (const skill of EXPECTED_SKILLS) {
  if (!existsSync(join(source, skill, "SKILL.md"))) {
    throw new Error(`${SKILLS_PACKAGE} is missing skills/${skill}/SKILL.md`);
  }
}

rmSync(destination, { recursive: true, force: true });
cpSync(source, destination, { recursive: true });

for (const script of [
  join(destination, "kb-lint", "scripts", "conformance.mjs"),
  join(destination, "kb-visualize", "scripts", "graph.mjs"),
]) {
  if (!existsSync(script)) throw new Error(`Synchronized skills are missing ${script}`);
}

process.stdout.write(`Synchronized ${SKILLS_PACKAGE}@${declaredVersion} into ${destination}\n`);
