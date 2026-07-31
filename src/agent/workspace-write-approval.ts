import { existsSync, realpathSync } from "node:fs";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import type { ToolConfigWithArgsContext } from "@mastra/core/workspace";

interface JanetWorkspaceState {
  projectPath?: unknown;
  bundlePath?: unknown;
}

function controllerState(
  requestContext: Record<string, unknown>,
): JanetWorkspaceState | undefined {
  const controller = requestContext["controller"];
  if (!controller || typeof controller !== "object") return;
  const state = (controller as { state?: unknown }).state;
  return state && typeof state === "object"
    ? (state as JanetWorkspaceState)
    : undefined;
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

/**
 * Resolve an existing path through symlinks. For a not-yet-created target,
 * resolve its nearest existing ancestor and append the missing suffix.
 */
function canonicalPotentialPath(path: string): string {
  let existing = path;
  while (!existsSync(existing)) {
    const parent = dirname(existing);
    if (parent === existing) return resolve(path);
    existing = parent;
  }
  const canonicalExisting = realpathSync(existing);
  return resolve(canonicalExisting, relative(existing, path));
}

/**
 * Janet reads the whole selected project, but the chosen bundle is the only
 * quiet-write area. A write elsewhere uses Mastra's normal approval flow.
 *
 * Missing or malformed context fails safe by requiring approval.
 */
export function workspaceWriteRequiresApproval({
  args,
  requestContext,
}: ToolConfigWithArgsContext): boolean {
  const state = controllerState(requestContext);
  const projectPath =
    typeof state?.projectPath === "string" ? state.projectPath : undefined;
  const bundlePath =
    typeof state?.bundlePath === "string" ? state.bundlePath : undefined;
  const requestedPath = typeof args["path"] === "string" ? args["path"] : undefined;
  if (!projectPath || !bundlePath || !requestedPath) return true;

  try {
    const target = canonicalPotentialPath(
      isAbsolute(requestedPath)
        ? resolve(requestedPath)
        : resolve(projectPath, requestedPath),
    );
    const bundle = canonicalPotentialPath(resolve(bundlePath));
    return !isInside(bundle, target);
  } catch {
    return true;
  }
}

export function workspaceWriteTarget(args: unknown): string | undefined {
  if (!args || typeof args !== "object" || !("path" in args)) return;
  return typeof args.path === "string" ? args.path : undefined;
}
