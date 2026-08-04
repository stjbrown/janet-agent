import { describe, expect, it } from "vitest";
import {
  createWorkspaceTools,
  WORKSPACE_TOOLS,
} from "@mastra/core/workspace";
import {
  createWorkspace,
  editToolsEnabled,
  managedCommandEnvironment,
} from "../src/agent/workspace.js";

function context(
  execute: "allow" | "ask" | "deny",
  edit: "allow" | "ask" | "deny" = "deny",
) {
  return {
    args: {},
    workspace: {},
    requestContext: {
      controller: {
        state: {
          permissionRules: {
            categories: { edit, execute },
          },
        },
      },
    },
  };
}

describe("workspace tool exposure", () => {
  it("enables edits only when policy allows them", () => {
    expect(editToolsEnabled(context("ask", "allow"))).toBe(true);
    expect(editToolsEnabled(context("ask", "deny"))).toBe(false);
  });

  it("fails closed when policy context is absent", () => {
    const missing = { args: {}, workspace: {}, requestContext: {} };
    expect(editToolsEnabled(missing)).toBe(false);
  });

  it("forwards only Buzz's managed-agent identity to approved commands", () => {
    expect(
      managedCommandEnvironment({
        BUZZ_PRIVATE_KEY: "agent-secret",
        BUZZ_RELAY_URL: "ws://127.0.0.1:3000",
        BUZZ_AUTH_TAG: "owner-proof",
        OPENAI_API_KEY: "do-not-forward",
        HOME: "/do-not-forward",
      }),
    ).toEqual({
      BUZZ_PRIVATE_KEY: "agent-secret",
      BUZZ_RELAY_URL: "ws://127.0.0.1:3000",
      BUZZ_AUTH_TAG: "owner-proof",
    });
  });

  it("keeps built-in shell tools disabled for every policy", async () => {
    const workspace = createWorkspace({
      projectPath: process.cwd(),
      skills: {
        relativeRoot: ".janet/skills",
        allowedPaths: [],
      },
    });

    for (const execute of ["deny", "ask", "allow"] as const) {
      const tools = await createWorkspaceTools(workspace, {
        requestContext: context(execute, "allow").requestContext,
        workspace,
      });
      expect(tools[WORKSPACE_TOOLS.FILESYSTEM.READ_FILE]).toBeDefined();
      expect(tools[WORKSPACE_TOOLS.FILESYSTEM.WRITE_FILE]).toBeDefined();
      expect(tools[WORKSPACE_TOOLS.SANDBOX.EXECUTE_COMMAND]).toBeUndefined();
      expect(tools[WORKSPACE_TOOLS.SANDBOX.GET_PROCESS_OUTPUT]).toBeUndefined();
      expect(tools[WORKSPACE_TOOLS.SANDBOX.KILL_PROCESS]).toBeUndefined();
    }
  });
});
