import { createTool } from "@mastra/core/tools";
import type { Workspace } from "@mastra/core/workspace";
import { z } from "zod";

export type ExecutePolicy = "allow" | "ask" | "deny";

interface ExecuteToolOptions {
  workspace: Workspace;
  policy: ExecutePolicy;
}

const inputSchema = z.object({
  command: z.string().min(1).describe("The shell command to execute"),
  timeout: z
    .number()
    .positive()
    .max(600)
    .optional()
    .describe("Maximum execution time in seconds (maximum 600)"),
  tail: z
    .number()
    .int()
    .min(0)
    .max(2_000)
    .optional()
    .describe("Return only the last N output lines; 0 disables line limiting"),
});

const approvalSchema = z.object({
  kind: z.literal("command_approval"),
  command: z.string(),
  question: z.string(),
});

const resumeSchema = z.object({
  approved: z.boolean(),
  always: z.boolean().optional(),
});

function tailLines(text: string, tail?: number): string {
  if (!tail) return text;
  return text.split("\n").slice(-tail).join("\n");
}

function boundedOutput(text: string): string {
  const maxChars = 64 * 1024;
  return text.length <= maxChars
    ? text
    : `[output truncated to last ${maxChars} characters]\n${text.slice(-maxChars)}`;
}

/**
 * Shell execution uses agent-native suspension instead of Mastra's generic
 * requireApproval gate. The generic gate loses provider tool-call correlation
 * when it resumes Vertex Anthropic runs; normal tool suspension preserves it.
 */
export function createExecuteTool(opts: ExecuteToolOptions) {
  let allowForSession = opts.policy === "allow";

  return {
    mastra_workspace_execute_command: createTool({
      id: "mastra_workspace_execute_command",
      description:
        "Execute a shell command from the project root. Interactive sessions require explicit user approval before the command runs.",
      inputSchema,
      suspendSchema: approvalSchema,
      resumeSchema,
      execute: async ({ command, timeout, tail }, context) => {
        if (opts.policy === "deny") {
          return "Shell execution is disabled for this run.";
        }

        const resumeData = context?.agent?.resumeData;
        if (!allowForSession && resumeData === undefined) {
          const suspend = context?.agent?.suspend;
          if (!suspend) return "Shell execution requires interactive approval.";
          await suspend({
            kind: "command_approval",
            command,
            question: `Allow Janet to run this command?\n${command}`,
          });
          return;
        }

        if (resumeData !== undefined) {
          const decision = resumeSchema.parse(resumeData);
          if (!decision.approved) return "The user declined this command.";
          if (decision.always) allowForSession = true;
        }

        const sandbox = opts.workspace.sandbox;
        const execute = sandbox?.executeCommand;
        if (!execute) return "Shell execution is unavailable in this workspace.";
        const result = await execute.call(
          sandbox,
          command,
          [],
          {
            timeout: timeout === undefined ? undefined : timeout * 1_000,
            abortSignal: context?.abortSignal,
          },
        );
        const combined = [result.stdout, result.stderr]
          .filter(Boolean)
          .join("\n");
        const output = boundedOutput(tailLines(combined, tail));
        if (result.success) return output || "(no output)";
        return `${output ? `${output}\n` : ""}Exit code: ${result.exitCode}`;
      },
    }),
  };
}
