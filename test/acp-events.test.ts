import type { AgentControllerEvent } from "@mastra/core/agent-controller";
import { describe, expect, it } from "vitest";
import {
  AssistantDeltaTracker,
  toolKind,
  toolLocations,
  toolTitle,
} from "../src/acp/events.js";

function messageEvent(text: string): Extract<
  AgentControllerEvent,
  { type: "message_update" }
> {
  return {
    type: "message_update",
    message: {
      id: "message-1",
      role: "assistant",
      content: { format: 2, parts: [{ type: "text", text }] },
    },
  } as never;
}

describe("ACP event mapping", () => {
  it("turns cumulative controller messages into deltas", () => {
    const tracker = new AssistantDeltaTracker();
    expect(tracker.update(messageEvent("Hello"))).toMatchObject({
      content: { text: "Hello" },
    });
    expect(tracker.update(messageEvent("Hello there"))).toMatchObject({
      content: { text: " there" },
    });
    expect(tracker.update(messageEvent("Hello there"))).toBeNull();
  });

  it("classifies tools and reports absolute locations", () => {
    expect(toolKind("mastra_workspace_write_file")).toBe("edit");
    expect(toolKind("janet_web_fetch")).toBe("fetch");
    expect(toolKind("mastra_workspace_delete")).toBe("delete");
    expect(toolLocations("/project", { path: "knowledge/index.md" })).toEqual([
      { path: "/project/knowledge/index.md" },
    ]);
    expect(toolTitle("mastra_workspace_execute_command", { command: "git status" })).toBe(
      "Run git status",
    );
  });
});
