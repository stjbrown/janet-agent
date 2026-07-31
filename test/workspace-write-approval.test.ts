import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  workspaceWriteRequiresApproval,
  workspaceWriteTarget,
} from "../src/agent/workspace-write-approval.js";

const fixtures: string[] = [];

function fixture() {
  const projectPath = mkdtempSync(join(tmpdir(), "janet-write-policy-"));
  fixtures.push(projectPath);
  const bundlePath = join(projectPath, "docs", "project-kb");
  return { projectPath, bundlePath };
}

function context(
  projectPath: string,
  bundlePath: string,
  path: string,
) {
  return {
    args: { path },
    requestContext: {
      controller: {
        state: { projectPath, bundlePath },
      },
    },
    workspace: {},
  };
}

afterEach(() => {
  for (const path of fixtures.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("workspaceWriteRequiresApproval", () => {
  it("quietly allows the selected bundle even before it exists", () => {
    const { projectPath, bundlePath } = fixture();

    expect(
      workspaceWriteRequiresApproval(
        context(projectPath, bundlePath, "docs/project-kb/concepts/example.md"),
      ),
    ).toBe(false);
    expect(
      workspaceWriteRequiresApproval(
        context(projectPath, bundlePath, "docs/project-kb"),
      ),
    ).toBe(false);
  });

  it("requires approval elsewhere in the project", () => {
    const { projectPath, bundlePath } = fixture();

    expect(
      workspaceWriteRequiresApproval(
        context(projectPath, bundlePath, "README.md"),
      ),
    ).toBe(true);
    expect(
      workspaceWriteRequiresApproval(
        context(projectPath, bundlePath, "docs/another-wiki/index.md"),
      ),
    ).toBe(true);
  });

  it("requires approval outside the project and when context is incomplete", () => {
    const { projectPath, bundlePath } = fixture();

    expect(
      workspaceWriteRequiresApproval(
        context(projectPath, bundlePath, "../outside.md"),
      ),
    ).toBe(true);
    expect(
      workspaceWriteRequiresApproval({
        args: { path: "knowledge/index.md" },
        requestContext: {},
        workspace: {},
      }),
    ).toBe(true);
  });

  it("does not let a bundle symlink turn a source file into a quiet write", () => {
    const { projectPath, bundlePath } = fixture();
    mkdirSync(bundlePath, { recursive: true });
    const sourcePath = join(projectPath, "README.md");
    writeFileSync(sourcePath, "# Source\n");
    symlinkSync(sourcePath, join(bundlePath, "linked.md"));

    expect(
      workspaceWriteRequiresApproval(
        context(projectPath, bundlePath, "docs/project-kb/linked.md"),
      ),
    ).toBe(true);
  });
});

describe("workspaceWriteTarget", () => {
  it("returns only a string path", () => {
    expect(workspaceWriteTarget({ path: "README.md" })).toBe("README.md");
    expect(workspaceWriteTarget({ path: 42 })).toBeUndefined();
    expect(workspaceWriteTarget(undefined)).toBeUndefined();
  });
});
