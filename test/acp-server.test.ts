import {
  client,
  methods,
  PROTOCOL_VERSION,
  type ClientContext,
  type SessionNotification,
} from "@agentclientprotocol/sdk";
import type { AgentControllerEvent } from "@mastra/core/agent-controller";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createJanetAcpAgent, runAcpServer } from "../src/acp/server.js";
import type {
  JanetAcpBootFactory,
  JanetAcpBootPort,
} from "../src/acp/types.js";

type Listener = (event: AgentControllerEvent) => void;

class FakeSession {
  readonly listeners = new Set<Listener>();
  readonly approvals: unknown[] = [];
  readonly answers: unknown[] = [];
  readonly id: string;
  selected = true;
  aborts = 0;
  behavior: "message" | "approval" | "question" | "wait" | "error" = "message";

  constructor(id: string) {
    this.id = id;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: AgentControllerEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  emitMessage(text: string): void {
    this.emit({
      type: "message_update",
      message: {
        id: `message-${this.id}`,
        role: "assistant",
        content: { format: 2, parts: [{ type: "text", text }] },
      },
    } as never);
  }

  async sendMessage(): Promise<void> {
    this.emit({ type: "agent_start" });
    if (this.behavior === "message") {
      this.emitMessage("Hello from Janet");
      this.emit({ type: "agent_end", reason: "complete" });
    } else if (this.behavior === "approval") {
      this.emit({
        type: "tool_start",
        toolCallId: "call-approval",
        toolName: "mastra_workspace_write_file",
        args: { path: "README.md" },
      });
      this.emit({
        type: "tool_approval_required",
        toolCallId: "call-approval",
        toolName: "mastra_workspace_write_file",
        args: { path: "README.md" },
      });
      this.emit({ type: "agent_end", reason: "suspended" });
    } else if (this.behavior === "question") {
      this.emit({
        type: "tool_start",
        toolCallId: "call-question",
        toolName: "ask_user",
        args: {},
      });
      this.emit({
        type: "tool_suspended",
        toolCallId: "call-question",
        toolName: "ask_user",
        args: {},
        suspendPayload: {
          question: "Which approach?",
          options: [{ label: "Safe" }, { label: "Fast" }],
          selectionMode: "single_select",
        },
      });
      this.emit({ type: "agent_end", reason: "suspended" });
    } else if (this.behavior === "error") {
      throw new Error("fetch failed", {
        cause: Object.assign(new Error("self-signed certificate in certificate chain"), {
          code: "SELF_SIGNED_CERT_IN_CHAIN",
        }),
      });
    }
  }

  respondToToolApproval(input: unknown): void {
    this.approvals.push(input);
    queueMicrotask(() => {
      this.emit({
        type: "tool_end",
        toolCallId: "call-approval",
        result: "written",
        isError: false,
      });
      this.emit({ type: "agent_end", reason: "complete" });
    });
  }

  async respondToToolSuspension(input: { resumeData: unknown }): Promise<void> {
    this.answers.push(input.resumeData);
    queueMicrotask(() => {
      this.emit({
        type: "tool_end",
        toolCallId: "call-question",
        result: input.resumeData,
        isError: false,
      });
      this.emitMessage(`Continuing with ${String(input.resumeData)}`);
      this.emit({ type: "agent_end", reason: "complete" });
    });
  }

  abort(): void {
    this.aborts++;
    queueMicrotask(() => this.emit({ type: "agent_end", reason: "aborted" }));
  }

  model = {
    hasSelection: () => this.selected,
    switch: async (_input: { modelId: string }) => {},
  };

  thread = {
    create: async () => ({ id: this.id }),
    getId: () => this.id,
  };
}

function fakeFactory() {
  const sessions: FakeSession[] = [];
  const destroy = vi.fn(async () => {});
  const boot: JanetAcpBootFactory = async () => {
    const session = new FakeSession(`session-${sessions.length + 1}`);
    sessions.push(session);
    return {
      controller: { destroy },
      session,
      paths: {
        projectPath: "/project",
        bundlePath: "/project/knowledge",
        resourceId: "resource-1",
      },
      herdrDetach: vi.fn(),
      observability: {
        tracingOptionsForTurn: () => undefined,
        flush: async () => {},
      },
    } as JanetAcpBootPort;
  };
  return { boot, sessions, destroy };
}

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function withClient<T>(input: {
  capabilities?: Record<string, unknown>;
  permission?: "allow-once" | "allow-always" | "reject-once";
  elicitationAnswer?: string;
  log?: (message: string) => void;
  publishInteraction?: (prompt: string, content: string) => Promise<boolean>;
  run: (ctx: {
    agent: ClientContext;
    updates: SessionNotification[];
    sessions: FakeSession[];
  }) => Promise<T>;
}): Promise<T> {
  const fixture = fakeFactory();
  const updates: SessionNotification[] = [];
  const { app, registry } = createJanetAcpAgent({
    boot: fixture.boot,
    log: input.log ?? (() => {}),
    publishInteraction: input.publishInteraction ?? (async () => false),
  });
  cleanups.push(() => registry.disposeAll());
  const testClient = client({ name: "test-client" })
    .onRequest(methods.client.session.requestPermission, () => ({
      outcome: {
        outcome: "selected",
        optionId: input.permission ?? "allow-once",
      },
    }))
    .onRequest(methods.client.elicitation.create, () => ({
      action: "accept",
      content: { answer: input.elicitationAnswer ?? "Safe" },
    }))
    .onNotification(methods.client.session.update, ({ params }) => {
      updates.push(params);
    });

  return testClient.connectWith(app, async (agentContext) => {
    await agentContext.request(methods.agent.initialize, {
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: input.capabilities ?? {},
      clientInfo: { name: "test", version: "1.0.0" },
    });
    const result = await input.run({
      agent: agentContext,
      updates,
      sessions: fixture.sessions,
    });
    return result;
  });
}

describe("Janet ACP agent", () => {
  it("uses clean newline-delimited JSON on stdio", async () => {
    const chunks: Buffer[] = [];
    let received!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      received = resolve;
    });
    const output = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.from(chunk));
        received();
        callback();
      },
    });
    const input = new PassThrough();
    const running = runAcpServer({ input, output, log: () => {} });
    input.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL_VERSION,
          clientCapabilities: {},
          clientInfo: { name: "stdio-test", version: "1.0.0" },
        },
      })}\n`,
    );
    await firstWrite;
    input.end();
    await expect(running).resolves.toBe(0);

    const lines = Buffer.concat(chunks).toString("utf8").trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        agentInfo: { name: "janet" },
      },
    });
  });

  it("initializes, creates a session, and streams a prompt", async () => {
    await withClient({
      run: async ({ agent, updates, sessions }) => {
        const created = await agent.request(methods.agent.session.new, {
          cwd: "/tmp",
          mcpServers: [],
        });
        sessions[0]!.behavior = "message";
        const response = await agent.request(methods.agent.session.prompt, {
          sessionId: created.sessionId,
          prompt: [{ type: "text", text: "Hello" }],
        });
        expect(response.stopReason).toBe("end_turn");
        expect(updates.map((item) => item.update)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              sessionUpdate: "agent_message_chunk",
              content: expect.objectContaining({ text: "Hello from Janet" }),
            }),
          ]),
        );
      },
    });
  });

  it("round-trips tool approval without hanging", async () => {
    const publishInteraction = vi.fn(async () => true);
    await withClient({
      permission: "allow-always",
      publishInteraction,
      run: async ({ agent, sessions }) => {
        const created = await agent.request(methods.agent.session.new, {
          cwd: "/tmp",
          mcpServers: [],
        });
        sessions[0]!.behavior = "approval";
        const response = await agent.request(methods.agent.session.prompt, {
          sessionId: created.sessionId,
          prompt: [{ type: "text", text: "Edit README" }],
        });
        expect(response.stopReason).toBe("end_turn");
        expect(sessions[0]!.approvals).toEqual([
          expect.objectContaining({ decision: "always_allow_category" }),
        ]);
        expect(publishInteraction).toHaveBeenCalledWith(
          "Edit README",
          expect.stringContaining("Open Janet's Activity panel"),
        );
      },
    });
  });

  it("uses a second prompt as the answer when elicitation is unavailable", async () => {
    const publishInteraction = vi.fn(async () => true);
    await withClient({
      publishInteraction,
      run: async ({ agent, sessions, updates }) => {
        const created = await agent.request(methods.agent.session.new, {
          cwd: "/tmp",
          mcpServers: [],
        });
        sessions[0]!.behavior = "question";
        await agent.request(methods.agent.session.prompt, {
          sessionId: created.sessionId,
          prompt: [{ type: "text", text: "Start" }],
        });
        expect(
          updates.some(
            ({ update }) =>
              update.sessionUpdate === "agent_message_chunk" &&
              update.content.type === "text" &&
              update.content.text.includes("Which approach?"),
          ),
        ).toBe(true);
        expect(publishInteraction).toHaveBeenCalledWith(
          "Start",
          expect.stringContaining("Which approach?"),
        );
        const eventId = "b".repeat(64);
        const response = await agent.request(methods.agent.session.prompt, {
          sessionId: created.sessionId,
          prompt: [{
            type: "text",
            text: `[Context]\nChannel: Test (#ce747caf-7143-4be1-b311-316834c12ad7)\nIMPORTANT: use \`--reply-to ${eventId}\`.\n\n[Buzz event: @mention]\nEvent ID: ${eventId}\nContent: @Janet 2\nTags: []`,
          }],
        });
        expect(response.stopReason).toBe("end_turn");
        expect(sessions[0]!.answers).toEqual(["Fast"]);
      },
    });
  });

  it("uses form elicitation when the client advertises it", async () => {
    await withClient({
      capabilities: { elicitation: { form: {} } },
      elicitationAnswer: "Safe",
      run: async ({ agent, sessions }) => {
        const created = await agent.request(methods.agent.session.new, {
          cwd: "/tmp",
          mcpServers: [],
        });
        sessions[0]!.behavior = "question";
        const response = await agent.request(methods.agent.session.prompt, {
          sessionId: created.sessionId,
          prompt: [{ type: "text", text: "Start" }],
        });
        expect(response.stopReason).toBe("end_turn");
        expect(sessions[0]!.answers).toEqual(["Safe"]);
      },
    });
  });

  it("cancels an active prompt", async () => {
    await withClient({
      run: async ({ agent, sessions }) => {
        const created = await agent.request(methods.agent.session.new, {
          cwd: "/tmp",
          mcpServers: [],
        });
        sessions[0]!.behavior = "wait";
        const prompt = agent.request(methods.agent.session.prompt, {
          sessionId: created.sessionId,
          prompt: [{ type: "text", text: "Wait" }],
        });
        await Promise.resolve();
        await agent.notify(methods.agent.session.cancel, { sessionId: created.sessionId });
        expect((await prompt).stopReason).toBe("cancelled");
        expect(sessions[0]!.aborts).toBeGreaterThan(0);
      },
    });
  });

  it("surfaces and logs a useful provider error", async () => {
    const log = vi.fn();
    await withClient({
      log,
      run: async ({ agent, sessions }) => {
        const created = await agent.request(methods.agent.session.new, {
          cwd: "/tmp",
          mcpServers: [],
        });
        sessions[0]!.behavior = "error";
        await expect(
          agent.request(methods.agent.session.prompt, {
            sessionId: created.sessionId,
            prompt: [{ type: "text", text: "Hello" }],
          }),
        ).rejects.toMatchObject({
          code: -32603,
          message: expect.stringContaining("self-signed certificate in certificate chain"),
        });
        expect(log).toHaveBeenCalledWith(
          expect.stringContaining("SELF_SIGNED_CERT_IN_CHAIN"),
        );
      },
    });
  });
});
