import type { AgentContext, ToolCallUpdate } from "@agentclientprotocol/sdk";
import { methods } from "@agentclientprotocol/sdk";
import type { JanetQuestion } from "./content.js";
import { questionForm } from "./content.js";

export type JanetPermissionDecision = "approve" | "always" | "decline" | "cancelled";

export async function requestToolPermission(
  client: AgentContext,
  input: {
    sessionId: string;
    toolCall: ToolCallUpdate;
    signal?: AbortSignal;
  },
): Promise<JanetPermissionDecision> {
  const response = await client.request(
    methods.client.session.requestPermission,
    {
      sessionId: input.sessionId,
      toolCall: input.toolCall,
      options: [
        { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
        { optionId: "allow-always", name: "Always allow", kind: "allow_always" },
        { optionId: "reject-once", name: "Reject", kind: "reject_once" },
      ],
    },
    input.signal ? { cancellationSignal: input.signal } : undefined,
  );
  if (response.outcome.outcome === "cancelled") return "cancelled";
  if (response.outcome.optionId === "allow-once") return "approve";
  if (response.outcome.optionId === "allow-always") return "always";
  return "decline";
}

export function supportsFormElicitation(capabilities: unknown): boolean {
  if (!capabilities || typeof capabilities !== "object") return false;
  const elicitation = (capabilities as { elicitation?: unknown }).elicitation;
  if (!elicitation || typeof elicitation !== "object") return false;
  return (elicitation as { form?: unknown }).form != null;
}

export async function elicitQuestion(
  client: AgentContext,
  input: {
    sessionId: string;
    question: JanetQuestion;
    signal?: AbortSignal;
  },
): Promise<string | string[] | undefined> {
  const response = await client.request(
    methods.client.elicitation.create,
    {
      sessionId: input.sessionId,
      toolCallId: input.question.toolCallId,
      mode: "form",
      message: input.question.question,
      requestedSchema: questionForm(input.question),
    },
    input.signal ? { cancellationSignal: input.signal } : undefined,
  );
  if (response.action !== "accept") return;
  const answer = (response.content as Record<string, unknown> | null | undefined)?.["answer"];
  return typeof answer === "string" ||
    (Array.isArray(answer) && answer.every((value) => typeof value === "string"))
    ? answer
    : undefined;
}
