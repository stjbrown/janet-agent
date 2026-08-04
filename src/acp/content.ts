import type { ContentBlock } from "@agentclientprotocol/sdk";
import type { QuestionOption } from "../agent/questions.js";

export function promptToText(blocks: ContentBlock[]): string {
  const parts = blocks.map((block) => {
    switch (block.type) {
      case "text":
        return block.text;
      case "resource_link":
        return [
          block.name || "Referenced resource",
          block.description,
          block.uri,
        ]
          .filter(Boolean)
          .join(" — ");
      default:
        throw new Error(`Janet does not support ACP prompt content of type ${block.type}.`);
    }
  });
  const text = parts.join("\n\n").trim();
  if (!text) throw new Error("ACP prompt must contain text or a resource link.");
  return text;
}

export interface JanetQuestion {
  toolCallId: string;
  question: string;
  options?: QuestionOption[];
  multi: boolean;
}

export function questionFromSuspension(input: {
  toolCallId: string;
  toolName: string;
  suspendPayload: unknown;
}): JanetQuestion | null {
  if (input.toolName !== "ask_user") return null;
  const payload = input.suspendPayload as {
    question?: unknown;
    options?: unknown;
    selectionMode?: unknown;
  } | null;
  const options = Array.isArray(payload?.options)
    ? payload.options.flatMap((option): QuestionOption[] => {
        if (!option || typeof option !== "object") return [];
        const candidate = option as { label?: unknown; description?: unknown };
        if (typeof candidate.label !== "string" || !candidate.label.trim()) return [];
        return [{
          label: candidate.label,
          ...(typeof candidate.description === "string" && candidate.description.trim()
            ? { description: candidate.description }
            : {}),
        }];
      })
    : undefined;
  return {
    toolCallId: input.toolCallId,
    question:
      typeof payload?.question === "string" && payload.question.trim()
        ? payload.question
        : "Janet needs your input.",
    ...(options?.length ? { options } : {}),
    multi: payload?.selectionMode === "multi_select",
  };
}

export function questionForm(question: JanetQuestion) {
  if (!question.options?.length) {
    return {
      type: "object" as const,
      properties: {
        answer: {
          type: "string" as const,
          title: "Answer",
          minLength: 1,
        },
      },
      required: ["answer"],
    };
  }
  const choices = question.options.map((option) => ({
    const: option.label,
    title: option.label,
    ...(option.description ? { description: option.description } : {}),
  }));
  if (question.multi) {
    return {
      type: "object" as const,
      properties: {
        answer: {
          type: "array" as const,
          title: "Answer",
          minItems: 1,
          items: { anyOf: choices },
        },
      },
      required: ["answer"],
    };
  }
  return {
    type: "object" as const,
    properties: {
      answer: {
        type: "string" as const,
        title: "Answer",
        oneOf: choices,
      },
    },
    required: ["answer"],
  };
}
