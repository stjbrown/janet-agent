import type { ToolCategory } from "@mastra/core/agent-controller";

/**
 * Classify janet's tools into permission categories (pattern: mastracode's
 * `permissions.ts`). The AgentController uses this to decide what needs
 * approval. Returning `null` means "no category", so tools that should never
 * prompt also receive explicit per-tool `allow` rules from
 * `JANET_ALWAYS_ALLOW_TOOL_RULES`.
 *
 * Without this resolver every tool falls to the default "ask" policy, which is
 * why an un-wired janet prompted for even read_file and skill.
 */
const ALWAYS_ALLOW = new Set([
  "skill",
  "skill_read",
  "skill_search",
  "ask_user",
  "task_write",
  "task_update",
  "task_complete",
  "task_check",
  "submit_plan",
]);

/**
 * These tools can request path-sensitive approval from the workspace. Janet's
 * controller keeps ordinary tools in yolo compatibility mode, but must not
 * auto-approve these requests when their target is outside the bundle.
 */
export const JANET_PATH_APPROVAL_TOOLS = new Set([
  "mastra_workspace_write_file",
  "mastra_workspace_edit_file",
  "mastra_workspace_delete",
  "mastra_workspace_mkdir",
  "mastra_workspace_ast_edit",
]);

export function janetApprovalOverride(
  toolName: string,
): "ask" | undefined {
  return JANET_PATH_APPROVAL_TOOLS.has(toolName) ? "ask" : undefined;
}

export const JANET_ALWAYS_ALLOW_TOOL_RULES = Object.fromEntries(
  [...ALWAYS_ALLOW].map((toolName) => [toolName, "allow" as const]),
) as Record<string, "allow">;

const CATEGORY: Record<string, ToolCategory> = {
  janet_read_pdf: "read",
  janet_read_pdf_chunk: "read",
  janet_web_fetch: "read",
  janet_web_fetch_chunk: "read",
  recall: "read",
  mastra_workspace_read_file: "read",
  mastra_workspace_list_files: "read",
  mastra_workspace_file_stat: "read",
  mastra_workspace_grep: "read",
  mastra_workspace_search: "read",
  mastra_workspace_lsp_inspect: "read",
  mastra_workspace_write_file: "edit",
  mastra_workspace_edit_file: "edit",
  mastra_workspace_delete: "edit",
  mastra_workspace_mkdir: "edit",
  mastra_workspace_ast_edit: "edit",
  mastra_workspace_index: "edit",
  mastra_workspace_execute_command: "execute",
  mastra_workspace_get_process_output: "execute",
  mastra_workspace_kill_process: "execute",
};

export function janetToolCategory(toolName: string): ToolCategory | null {
  if (ALWAYS_ALLOW.has(toolName)) return null;
  return CATEGORY[toolName] ?? "other";
}
