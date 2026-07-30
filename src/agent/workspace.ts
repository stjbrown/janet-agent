import {
  LocalFilesystem,
  LocalSandbox,
  Workspace,
  WORKSPACE_TOOLS,
} from "@mastra/core/workspace";
import type { ToolConfigContext } from "@mastra/core/workspace";
import type { SkillMount } from "./skills-paths.js";

export interface WorkspaceOptions {
  /** The project dir Janet operates on (cwd); where `knowledge/` lives. */
  projectPath: string;
  /** The mounted kb-* skills (relative root + symlink-target read exceptions). */
  skills: SkillMount;
}

type PolicyContext = Pick<ToolConfigContext, "requestContext">;

function categoryPolicy(
  { requestContext }: PolicyContext,
  category: "edit" | "execute",
): unknown {
  const controller = requestContext["controller"];
  if (!controller || typeof controller !== "object") return;
  const state = (controller as { state?: unknown }).state;
  if (!state || typeof state !== "object") return;
  const rules = (state as { permissionRules?: unknown }).permissionRules;
  if (!rules || typeof rules !== "object") return;
  const categories = (rules as { categories?: unknown }).categories;
  if (!categories || typeof categories !== "object") return;
  return (categories as Record<string, unknown>)[category];
}

export function editToolsEnabled(context: PolicyContext): boolean {
  return categoryPolicy(context, "edit") === "allow";
}

/**
 * Build the workspace. The filesystem base is the whole project (so Janet can
 * read README/notes for ingest/schema inference); writes stay within the
 * project and are steered to the bundle by the skills. `skills` is a
 * WORKSPACE-RELATIVE path (Mastra rejects absolute skills paths); the symlink
 * targets are added to `allowedPaths` so reads resolve through the links.
 *
 * The built-in sandbox tools stay disabled. Janet exposes a dedicated command
 * tool whose suspension-based approval keeps the original provider tool-call ID
 * intact. `requireReadBeforeWrite` remains a correctness guard for mutations.
 */
export function createWorkspace(opts: WorkspaceOptions): Workspace {
  return new Workspace({
    id: "janet-workspace",
    filesystem: new LocalFilesystem({
      basePath: opts.projectPath,
      allowedPaths: opts.skills.allowedPaths,
    }),
    sandbox: new LocalSandbox({ workingDirectory: opts.projectPath }),
    skills: [opts.skills.relativeRoot],
    tools: {
      // Unknown future workspace tools inherit `false` and stay unavailable
      // until Janet gives them an explicit policy.
      enabled: false,
      requireApproval: true,
      [WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]: {
        enabled: true,
        requireApproval: false,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.LIST_FILES]: {
        enabled: true,
        requireApproval: false,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.FILE_STAT]: {
        enabled: true,
        requireApproval: false,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.GREP]: {
        enabled: true,
        requireApproval: false,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]: {
        enabled: editToolsEnabled,
        requireApproval: false,
        requireReadBeforeWrite: true,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.EDIT_FILE]: {
        enabled: editToolsEnabled,
        requireApproval: false,
        requireReadBeforeWrite: true,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.DELETE]: {
        enabled: editToolsEnabled,
        requireApproval: false,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.MKDIR]: {
        enabled: editToolsEnabled,
        requireApproval: false,
      },
      [WORKSPACE_TOOLS.FILESYSTEM.AST_EDIT]: {
        enabled: editToolsEnabled,
        requireApproval: false,
      },
      [WORKSPACE_TOOLS.SEARCH.SEARCH]: {
        enabled: true,
        requireApproval: false,
      },
      [WORKSPACE_TOOLS.SEARCH.INDEX]: {
        enabled: editToolsEnabled,
        requireApproval: false,
      },
      [WORKSPACE_TOOLS.LSP.LSP_INSPECT]: {
        enabled: true,
        requireApproval: false,
      },
      [WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]: {
        enabled: false,
      },
      [WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]: {
        enabled: false,
      },
      [WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]: {
        enabled: false,
      },
    },
  });
}
