import type { AgentControllerEvent } from "@mastra/core/agent-controller";
import type { TracingOptions } from "@mastra/core/observability";
import type { BootOptions } from "../agent/controller.js";
import type { ProjectPaths } from "../agent/paths.js";

export interface JanetAcpSessionPort {
  subscribe(listener: (event: AgentControllerEvent) => void): () => void;
  sendMessage(input: { content: string; tracingOptions?: TracingOptions }): Promise<void>;
  respondToToolApproval(input: {
    decision: "approve" | "decline" | "always_allow_category";
    toolCallId?: string;
  }): void;
  respondToToolSuspension(input: {
    resumeData: unknown;
    toolCallId?: string;
  }): Promise<void>;
  abort(): void;
  model: {
    hasSelection(): boolean;
    switch(input: { modelId: string }): Promise<void>;
  };
  thread: {
    create(input?: { title?: string; id?: string }): Promise<{ id: string }>;
    getId(): string | null;
  };
}

export interface JanetAcpBootPort {
  controller: { destroy(): Promise<void> };
  session: JanetAcpSessionPort;
  paths: Pick<ProjectPaths, "projectPath" | "bundlePath" | "resourceId">;
  herdrDetach(): void;
  observability: {
    tracingOptionsForTurn(context: {
      interactive: boolean;
      operation: "chat";
      resourceId: string;
      threadId?: string;
      transport?: "acp";
    }): TracingOptions | undefined;
    flush(): Promise<void>;
  };
}

export type JanetAcpBootFactory = (
  options: BootOptions,
) => Promise<JanetAcpBootPort>;
