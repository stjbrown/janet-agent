import { statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

const WORKSPACE_READ_FILE = "mastra_workspace_read_file";

function inputPath(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || !("path" in input)) return;
  return typeof input.path === "string" ? input.path : undefined;
}

function pathInsideProject(projectPath: string, requestedPath: string): string | undefined {
  const absolutePath = isAbsolute(requestedPath)
    ? resolve(requestedPath)
    : resolve(projectPath, requestedPath);
  const projectRelative = relative(resolve(projectPath), absolutePath);
  if (
    projectRelative === ".." ||
    projectRelative.startsWith(`..${sep}`) ||
    isAbsolute(projectRelative)
  ) {
    return;
  }
  return absolutePath;
}

/**
 * Turn a common read-file/list-files mix-up into normal tool guidance. Missing,
 * inaccessible, and out-of-project paths still flow to the workspace so its
 * canonical validation and error handling remain authoritative.
 */
export function guardWorkspaceDirectoryRead(
  toolName: string,
  input: unknown,
  projectPath: string,
) {
  if (toolName !== WORKSPACE_READ_FILE) return;
  const requestedPath = inputPath(input);
  if (!requestedPath) return;
  const absolutePath = pathInsideProject(projectPath, requestedPath);
  if (!absolutePath) return;

  try {
    if (!statSync(absolutePath).isDirectory()) return;
  } catch {
    return;
  }

  return {
    proceed: false as const,
    output:
      `That path is a directory: ${requestedPath}. ` +
      `Use mastra_workspace_list_files with path "${requestedPath}" instead.`,
  };
}
