import { describe, expect, it } from "vitest";
import {
  nextUnhandledSuspension,
  type PendingToolSuspension,
} from "../src/tui/pending-suspension.js";

function suspension(toolCallId: string): PendingToolSuspension {
  return {
    toolCallId,
    toolName: "mastra_workspace_execute_command",
    args: { command: "true" },
    suspendPayload: { kind: "command_approval", command: "true" },
  };
}

describe("pending suspension recovery", () => {
  it("recovers a suspension from canonical display state", () => {
    const expected = suspension("call-1");
    expect(
      nextUnhandledSuspension(new Map([[expected.toolCallId, expected]]), new Set()),
    ).toBe(expected);
  });

  it("does not render an already handled suspension twice", () => {
    const first = suspension("call-1");
    const second = suspension("call-2");
    expect(
      nextUnhandledSuspension(
        new Map([
          [first.toolCallId, first],
          [second.toolCallId, second],
        ]),
        new Set([first.toolCallId]),
      ),
    ).toBe(second);
  });
});
