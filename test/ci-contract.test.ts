import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CI release contract", () => {
  it("derives the skills smoke-check version instead of hard-coding a release", () => {
    const workflow = readFileSync(
      new URL("../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    );

    expect(workflow).toContain(
      'const skillsVersion = p.devDependencies["@stjbrown/agent-knowledge-skills"]',
    );
    expect(workflow).toContain("version: ${skillsVersion}");
    expect(workflow).not.toMatch(
      /devDependencies\["@stjbrown\/agent-knowledge-skills"\]\s*!==\s*"\d/,
    );
  });
});
