import { describe, expect, it, vi } from "vitest";
import { createExecuteTool } from "../src/tools/execute.js";

function harness(policy: "allow" | "ask" | "deny") {
  const executeCommand = vi.fn(async () => ({
    success: true,
    exitCode: 0,
    stdout: "conformance: ok\n",
    stderr: "",
    executionTimeMs: 5,
  }));
  const workspace = {
    sandbox: { executeCommand },
  };
  const tool = createExecuteTool({
    workspace: workspace as never,
    policy,
  }).mastra_workspace_execute_command;
  return { executeCommand, tool };
}

describe("Janet shell execution", () => {
  it("suspends an interactive command for approval", async () => {
    const { executeCommand, tool } = harness("ask");
    const suspend = vi.fn(async () => {});

    const result = await tool.execute?.(
      { command: "node conformance.mjs knowledge" },
      { agent: { suspend } } as never,
    );

    expect(result).toBeUndefined();
    expect(executeCommand).not.toHaveBeenCalled();
    expect(suspend).toHaveBeenCalledWith(
      {
        kind: "command_approval",
        command: "node conformance.mjs knowledge",
        question:
          "Allow Janet to run this command?\nnode conformance.mjs knowledge",
      },
      undefined,
    );
  });

  it("runs the approved command and returns its result", async () => {
    const { executeCommand, tool } = harness("ask");

    const result = await tool.execute?.(
      { command: "node conformance.mjs knowledge", timeout: 30 },
      { agent: { resumeData: { approved: true } } } as never,
    );

    expect(executeCommand).toHaveBeenCalledWith(
      "node conformance.mjs knowledge",
      [],
      expect.objectContaining({ timeout: 30_000 }),
    );
    expect(result).toBe("conformance: ok\n");
  });

  it("remembers always-allow for the remaining process session", async () => {
    const { executeCommand, tool } = harness("ask");

    await tool.execute?.(
      { command: "first" },
      { agent: { resumeData: { approved: true, always: true } } } as never,
    );
    const result = await tool.execute?.(
      { command: "second" },
      { agent: {} } as never,
    );

    expect(executeCommand).toHaveBeenCalledTimes(2);
    expect(result).toBe("conformance: ok\n");
  });

  it("asks again after a one-command approval", async () => {
    const { executeCommand, tool } = harness("ask");
    const suspend = vi.fn(async () => {});

    await tool.execute?.(
      { command: "first" },
      { agent: { resumeData: { approved: true } } } as never,
    );
    const result = await tool.execute?.(
      { command: "second" },
      { agent: { suspend } } as never,
    );

    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(suspend).toHaveBeenCalledOnce();
    expect(result).toBeUndefined();
  });

  it("fails closed when shell execution is denied", async () => {
    const { executeCommand, tool } = harness("deny");

    const result = await tool.execute?.(
      { command: "git status" },
      { agent: {} } as never,
    );

    expect(result).toBe("Shell execution is disabled for this run.");
    expect(executeCommand).not.toHaveBeenCalled();
  });
});
