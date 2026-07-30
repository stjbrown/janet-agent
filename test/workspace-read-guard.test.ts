import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { guardWorkspaceDirectoryRead } from "../src/tools/workspace-read-guard.js";

const fixtures: string[] = [];

function fixture() {
  const projectPath = mkdtempSync(join(tmpdir(), "janet-read-guard-"));
  fixtures.push(projectPath);
  mkdirSync(join(projectPath, "docs"));
  writeFileSync(join(projectPath, "README.md"), "# Test\n");
  return projectPath;
}

afterEach(() => {
  while (fixtures.length) rmSync(fixtures.pop()!, { recursive: true, force: true });
});

describe("workspace directory read guard", () => {
  it("redirects a read_file call for a directory to list_files", () => {
    const projectPath = fixture();

    expect(
      guardWorkspaceDirectoryRead(
        "mastra_workspace_read_file",
        { path: "docs" },
        projectPath,
      ),
    ).toEqual({
      proceed: false,
      output:
        'That path is a directory: docs. Use mastra_workspace_list_files with path "docs" instead.',
    });
  });

  it("allows ordinary files through", () => {
    const projectPath = fixture();

    expect(
      guardWorkspaceDirectoryRead(
        "mastra_workspace_read_file",
        { path: "README.md" },
        projectPath,
      ),
    ).toBeUndefined();
  });

  it("leaves out-of-project and missing paths to workspace validation", () => {
    const projectPath = fixture();

    expect(
      guardWorkspaceDirectoryRead(
        "mastra_workspace_read_file",
        { path: "../outside" },
        projectPath,
      ),
    ).toBeUndefined();
    expect(
      guardWorkspaceDirectoryRead(
        "mastra_workspace_read_file",
        { path: "missing" },
        projectPath,
      ),
    ).toBeUndefined();
  });
});
