import { isAbsolute, resolve } from "node:path";
import type {
  SessionUpdate,
  ToolCallLocation,
  ToolKind,
} from "@agentclientprotocol/sdk";
import type { AgentControllerEvent } from "@mastra/core/agent-controller";
import { janetToolCategory } from "../agent/permissions.js";
import { messageText } from "../headless/format.js";

const MAX_TOOL_TEXT = 4_000;

function clipped(value: string, max: number = MAX_TOOL_TEXT): string {
  return value.length <= max ? value : `${value.slice(0, max)}\n…(truncated)`;
}

function displayValue(value: unknown): string {
  if (typeof value === "string") return clipped(value);
  try {
    return clipped(JSON.stringify(value, null, 2));
  } catch {
    return clipped(String(value));
  }
}

export function toolKind(toolName: string): ToolKind {
  const lower = toolName.toLowerCase();
  if (lower.includes("delete") || lower.includes("remove")) return "delete";
  if (lower.includes("move") || lower.includes("rename")) return "move";
  if (lower.includes("search") || lower.includes("grep") || lower.includes("index")) {
    return "search";
  }
  if (lower.includes("fetch") || lower.includes("web")) return "fetch";
  const category = janetToolCategory(toolName);
  if (category === "read") return "read";
  if (category === "edit") return "edit";
  if (category === "execute") return "execute";
  return "other";
}

function firstString(input: unknown, keys: string[]): string | undefined {
  if (!input || typeof input !== "object") return;
  const record = input as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
}

export function toolTitle(toolName: string, args: unknown): string {
  const path = firstString(args, ["path", "filePath", "directory", "source"]);
  const command = firstString(args, ["command"]);
  const skill = firstString(args, ["skill", "name"]);
  const kind = toolKind(toolName);
  if (command) return `Run ${clipped(command, 120)}`;
  if (skill && toolName === "skill") return `Load skill ${skill}`;
  if (path) {
    const verb = kind === "read" ? "Read" : kind === "delete" ? "Delete" : "Edit";
    return `${verb} ${clipped(path, 160)}`;
  }
  return toolName
    .replace(/^mastra_workspace_/, "")
    .replace(/^janet_/, "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function toolLocations(cwd: string, args: unknown): ToolCallLocation[] | undefined {
  const value = firstString(args, [
    "path",
    "filePath",
    "directory",
    "sourcePath",
    "targetPath",
  ]);
  if (!value || /^[a-z]+:\/\//i.test(value)) return;
  return [{ path: isAbsolute(value) ? value : resolve(cwd, value) }];
}

export class AssistantDeltaTracker {
  readonly #lengths = new Map<string, number>();

  update(event: Extract<AgentControllerEvent, { type: "message_update" | "message_end" }>): SessionUpdate | null {
    if (event.message.role !== "assistant") return null;
    const text = messageText(event.message);
    const previous = this.#lengths.get(event.message.id) ?? 0;
    if (text.length <= previous) return null;
    const delta = text.slice(previous);
    this.#lengths.set(event.message.id, text.length);
    return {
      sessionUpdate: "agent_message_chunk",
      messageId: event.message.id,
      content: { type: "text", text: delta },
    };
  }
}

export function toolStartUpdate(
  cwd: string,
  event: Extract<AgentControllerEvent, { type: "tool_start" }>,
): SessionUpdate {
  return {
    sessionUpdate: "tool_call",
    toolCallId: event.toolCallId,
    title: toolTitle(event.toolName, event.args),
    kind: toolKind(event.toolName),
    status: "in_progress",
    ...(toolLocations(cwd, event.args)
      ? { locations: toolLocations(cwd, event.args) }
      : {}),
  };
}

export function toolProgressUpdate(
  event: Extract<AgentControllerEvent, { type: "tool_update" | "shell_output" }>,
): SessionUpdate {
  const text = event.type === "shell_output" ? event.output : displayValue(event.partialResult);
  return {
    sessionUpdate: "tool_call_update",
    toolCallId: event.toolCallId,
    status: "in_progress",
    content: [{ type: "content", content: { type: "text", text: clipped(text) } }],
  };
}

export function toolEndUpdate(
  event: Extract<AgentControllerEvent, { type: "tool_end" }>,
): SessionUpdate {
  const text = displayValue(event.result);
  return {
    sessionUpdate: "tool_call_update",
    toolCallId: event.toolCallId,
    status: event.isError ? "failed" : "completed",
    ...(text
      ? { content: [{ type: "content", content: { type: "text", text } }] }
      : {}),
  };
}
