import { isAbsolute } from "node:path";
import { realpathSync, statSync } from "node:fs";
import type {
  AgentContext,
  ClientCapabilities,
  PromptResponse,
  StopReason,
} from "@agentclientprotocol/sdk";
import { methods, RequestError } from "@agentclientprotocol/sdk";
import type { AgentControllerEvent } from "@mastra/core/agent-controller";
import { bootJanet } from "../agent/controller.js";
import {
  formatQuestion,
  resolveQuestionAnswer,
} from "../agent/questions.js";
import { promptToText, questionFromSuspension, type JanetQuestion } from "./content.js";
import {
  AssistantDeltaTracker,
  toolEndUpdate,
  toolKind,
  toolLocations,
  toolProgressUpdate,
  toolStartUpdate,
  toolTitle,
} from "./events.js";
import {
  elicitQuestion,
  requestToolPermission,
  supportsFormElicitation,
} from "./interaction.js";
import type {
  JanetAcpBootFactory,
  JanetAcpBootPort,
} from "./types.js";
import {
  buzzEventContent,
  publishBuzzInteraction,
} from "./buzz.js";

interface SessionOptions {
  cwd: string;
  bundle?: string;
  modelId?: string;
  boot: JanetAcpBootPort;
  log: (message: string) => void;
  publishInteraction: (prompt: string, content: string) => Promise<boolean>;
}

interface PendingQuestion extends JanetQuestion {}

interface PromptContext {
  client: AgentContext;
  signal: AbortSignal;
  formElicitation: boolean;
}

class Deferred<T> {
  readonly promise: Promise<T>;
  resolve!: (value: T) => void;
  reject!: (reason: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
}

function safeErrorDetails(error: unknown): string {
  const details: string[] = [];
  const visited = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; current !== undefined && current !== null && depth < 4; depth++) {
    if (visited.has(current)) break;
    visited.add(current);

    if (current instanceof Error) {
      const code = "code" in current && typeof current.code === "string" ? current.code : undefined;
      details.push(code ? `${current.message} (${code})` : current.message);
      current = current.cause;
      continue;
    }
    if (typeof current === "object" && "message" in current) {
      const message = (current as { message?: unknown }).message;
      if (typeof message === "string") details.push(message);
      current = (current as { cause?: unknown }).cause;
      continue;
    }
    if (typeof current === "string") details.push(current);
    break;
  }

  const summary = [...new Set(details.filter(Boolean))].join("; caused by: ") || "Unknown error";
  return summary
    .replace(/(authorization\s*[:=]\s*bearer\s+)\S+/gi, "$1[redacted]")
    .replace(/(bearer\s+)\S+/gi, "$1[redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[redacted]")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

class ActiveTurn {
  readonly #runtime: JanetAcpSession;
  readonly #context: PromptContext;
  readonly #deltas = new AssistantDeltaTracker();
  readonly #result = new Deferred<StopReason>();
  readonly #prompt: string;
  #notifications = Promise.resolve();
  #interactions = 0;
  #lastEndReason: Extract<AgentControllerEvent, { type: "agent_end" }>["reason"];
  #finished = false;
  #unsubscribe: (() => void) | undefined;

  constructor(runtime: JanetAcpSession, context: PromptContext, prompt: string) {
    this.#runtime = runtime;
    this.#context = context;
    this.#prompt = prompt;
    this.#unsubscribe = runtime.boot.session.subscribe((event) => this.#onEvent(event));
  }

  async sendMessage(content: string): Promise<PromptResponse> {
    void this.#runtime.boot.session.sendMessage({
      content,
      tracingOptions: this.#runtime.boot.observability.tracingOptionsForTurn({
        interactive: true,
        operation: "chat",
        resourceId: this.#runtime.boot.paths.resourceId,
        threadId: this.#runtime.boot.session.thread.getId() ?? undefined,
        transport: "acp",
      }),
    }).catch((error) => this.#fail(error));
    return { stopReason: await this.#result.promise };
  }

  async answerPending(question: PendingQuestion, answerText: string): Promise<PromptResponse> {
    const answer = resolveQuestionAnswer(
      question,
      buzzEventContent(answerText) ?? answerText,
    );
    if (answer === undefined) {
      this.#runtime.pendingQuestion = question;
      this.#notifyText(
        "That answer did not match the available choices. " +
          "Reply with a number, an exact label, or a comma-separated list where requested.",
      );
      this.#finish("end_turn");
      return { stopReason: await this.#result.promise };
    }
    this.#runtime.pendingQuestion = undefined;
    void this.#runtime.boot.session
      .respondToToolSuspension({
        toolCallId: question.toolCallId,
        resumeData: answer,
      })
      .catch((error) => this.#fail(error));
    return { stopReason: await this.#result.promise };
  }

  cancel(): void {
    this.#runtime.boot.session.abort();
    this.#finish("cancelled");
  }

  close(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }

  #notify(update: Parameters<AgentContext["notify"]>[1]): void {
    if (this.#finished) return;
    this.#notifications = this.#notifications.then(() =>
      this.#context.client.notify(methods.client.session.update, {
        sessionId: this.#runtime.id,
        update,
      }),
    );
  }

  #notifyText(text: string, messageId?: string): void {
    this.#notify({
      sessionUpdate: "agent_message_chunk",
      messageId: messageId ?? `janet-${crypto.randomUUID()}`,
      content: { type: "text", text },
    });
  }

  #startInteraction(action: () => Promise<void>): void {
    this.#interactions++;
    void action()
      .catch((error) => this.#fail(error))
      .finally(() => {
        this.#interactions--;
        this.#settleSuspendedTurn();
      });
  }

  #settleSuspendedTurn(): void {
    if (this.#lastEndReason !== "suspended" || this.#interactions > 0) return;
    if (this.#runtime.pendingQuestion) this.#finish("end_turn");
  }

  #handleApproval(
    event: Extract<AgentControllerEvent, { type: "tool_approval_required" }>,
  ): void {
    this.#startInteraction(async () => {
      const title = toolTitle(event.toolName, event.args);
      const notice = this.#runtime.publishInteraction(
        this.#prompt,
        `Janet needs your approval to **${title}**. Open Janet's Activity panel and choose Allow once, Always allow, or Reject.`,
      );
      let decision: Awaited<ReturnType<typeof requestToolPermission>> = "decline";
      try {
        decision = await requestToolPermission(this.#context.client, {
          sessionId: this.#runtime.id,
          toolCall: {
            toolCallId: event.toolCallId,
            title,
            kind: toolKind(event.toolName),
            status: "pending",
            ...(toolLocations(this.#runtime.cwd, event.args)
              ? { locations: toolLocations(this.#runtime.cwd, event.args) }
              : {}),
          },
          signal: this.#context.signal,
        });
      } catch (error) {
        this.#notifyText(
          `The client could not surface approval for ${event.toolName}; Janet declined it safely.`,
        );
      }
      await notice;
      this.#runtime.boot.session.respondToToolApproval({
        toolCallId: event.toolCallId,
        decision:
          decision === "always"
            ? "always_allow_category"
            : decision === "approve"
              ? "approve"
              : "decline",
      });
    });
  }

  #handleCommandApproval(
    event: Extract<AgentControllerEvent, { type: "tool_suspended" }>,
  ): void {
    this.#startInteraction(async () => {
      const title = toolTitle(event.toolName, event.args);
      const notice = this.#runtime.publishInteraction(
        this.#prompt,
        `Janet needs your approval to **${title}**. Open Janet's Activity panel and choose Allow once, Always allow, or Reject.`,
      );
      let decision: Awaited<ReturnType<typeof requestToolPermission>> = "decline";
      try {
        decision = await requestToolPermission(this.#context.client, {
          sessionId: this.#runtime.id,
          toolCall: {
            toolCallId: event.toolCallId,
            title,
            kind: "execute",
            status: "pending",
          },
          signal: this.#context.signal,
        });
      } catch {
        this.#notifyText("The client could not surface command approval; Janet declined it safely.");
      }
      await notice;
      await this.#runtime.boot.session.respondToToolSuspension({
        toolCallId: event.toolCallId,
        resumeData: {
          approved: decision === "approve" || decision === "always",
          always: decision === "always",
        },
      });
    });
  }

  #handleQuestion(question: PendingQuestion): void {
    if (!this.#context.formElicitation) {
      this.#runtime.pendingQuestion = question;
      const text = formatQuestion(question.question, question.options, question.multi);
      this.#notifyText(
        text,
        `janet-question-${question.toolCallId}`,
      );
      this.#startInteraction(async () => {
        await this.#runtime.publishInteraction(this.#prompt, text);
      });
      return;
    }
    this.#startInteraction(async () => {
      let answer: string | string[] | undefined;
      try {
        answer = await elicitQuestion(this.#context.client, {
          sessionId: this.#runtime.id,
          question,
          signal: this.#context.signal,
        });
      } catch {
        this.#runtime.pendingQuestion = question;
        this.#notifyText(
          formatQuestion(question.question, question.options, question.multi),
          `janet-question-${question.toolCallId}`,
        );
        return;
      }
      await this.#runtime.boot.session.respondToToolSuspension({
        toolCallId: question.toolCallId,
        resumeData:
          answer ?? "The user declined to answer. Continue safely without that information if possible.",
      });
    });
  }

  #onEvent(event: AgentControllerEvent): void {
    switch (event.type) {
      case "message_update":
      case "message_end": {
        const update = this.#deltas.update(event);
        if (update) this.#notify(update);
        break;
      }
      case "tool_start":
        this.#notify(toolStartUpdate(this.#runtime.cwd, event));
        break;
      case "tool_update":
      case "shell_output":
        this.#notify(toolProgressUpdate(event));
        break;
      case "tool_end":
        this.#notify(toolEndUpdate(event));
        break;
      case "tool_approval_required":
        this.#handleApproval(event);
        break;
      case "tool_suspended": {
        const payload = event.suspendPayload as { kind?: unknown } | null;
        if (payload?.kind === "command_approval") {
          this.#handleCommandApproval(event);
          break;
        }
        const question = questionFromSuspension(event);
        if (question) this.#handleQuestion(question);
        else {
          this.#startInteraction(async () => {
            await this.#runtime.boot.session.respondToToolSuspension({
              toolCallId: event.toolCallId,
              resumeData: { action: "denied" },
            });
          });
        }
        break;
      }
      case "error":
        this.#fail(event.error);
        break;
      case "agent_end":
        this.#lastEndReason = event.reason;
        if (event.reason === "aborted") this.#finish("cancelled");
        else if (event.reason === "error") this.#fail(new Error("Janet's run ended with an error."));
        else if (event.reason === "suspended") this.#settleSuspendedTurn();
        else this.#finish("end_turn");
        break;
    }
  }

  #finish(reason: StopReason): void {
    if (this.#finished) return;
    this.#finished = true;
    void this.#notifications.then(
      () => this.#result.resolve(reason),
      (error) => this.#result.reject(error),
    );
  }

  #fail(error: unknown): void {
    if (this.#finished) return;
    this.#finished = true;
    void this.#notifications.then(
      () => this.#result.reject(error),
      () => this.#result.reject(error),
    );
  }
}

export class JanetAcpSession {
  readonly id: string;
  readonly cwd: string;
  readonly bundle?: string;
  readonly modelId?: string;
  readonly boot: JanetAcpBootPort;
  readonly #log: (message: string) => void;
  readonly #publishInteraction: SessionOptions["publishInteraction"];
  pendingQuestion: PendingQuestion | undefined;
  #activeTurn: ActiveTurn | undefined;
  #disposed = false;

  constructor(id: string, options: SessionOptions) {
    this.id = id;
    this.cwd = options.cwd;
    this.bundle = options.bundle;
    this.modelId = options.modelId;
    this.boot = options.boot;
    this.#log = options.log;
    this.#publishInteraction = options.publishInteraction;
  }

  async prompt(
    prompt: string,
    context: PromptContext,
  ): Promise<PromptResponse> {
    if (this.#disposed) throw new Error(`ACP session ${this.id} is closed.`);
    if (this.#activeTurn) {
      throw RequestError.invalidParams(
        { sessionId: this.id },
        "A prompt is already running for this Janet session.",
      );
    }
    const turn = new ActiveTurn(this, context, prompt);
    this.#activeTurn = turn;
    const abort = () => turn.cancel();
    context.signal.addEventListener("abort", abort, { once: true });
    try {
      return this.pendingQuestion
        ? await turn.answerPending(this.pendingQuestion, prompt)
        : await turn.sendMessage(prompt);
    } catch (error) {
      if (error instanceof RequestError) throw error;
      const details = safeErrorDetails(error);
      this.#log(`Janet ACP turn failed (session ${this.id}): ${details}`);
      throw RequestError.internalError(
        { details },
        `Janet turn failed: ${details}`,
      );
    } finally {
      context.signal.removeEventListener("abort", abort);
      turn.close();
      if (this.#activeTurn === turn) this.#activeTurn = undefined;
    }
  }

  cancel(): void {
    this.#activeTurn?.cancel();
    if (!this.#activeTurn) this.boot.session.abort();
  }

  async publishInteraction(prompt: string, content: string): Promise<void> {
    try {
      await this.#publishInteraction(prompt, content);
    } catch (error) {
      this.#log(
        `Janet ACP could not publish a Buzz interaction (session ${this.id}): ${safeErrorDetails(error)}`,
      );
    }
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.cancel();
    this.boot.herdrDetach();
    await this.boot.observability.flush().catch(() => {});
    await this.boot.controller.destroy();
  }
}

export interface JanetAcpRegistryOptions {
  bundle?: string;
  modelId?: string;
  boot?: JanetAcpBootFactory;
  log?: (message: string) => void;
  publishInteraction?: (prompt: string, content: string) => Promise<boolean>;
}

export class JanetAcpRegistry {
  readonly #sessions = new Map<string, JanetAcpSession>();
  readonly #options: Required<Pick<JanetAcpRegistryOptions, "boot" | "log" | "publishInteraction">> &
    Omit<JanetAcpRegistryOptions, "boot" | "log" | "publishInteraction">;
  clientCapabilities: ClientCapabilities | undefined;

  constructor(options: JanetAcpRegistryOptions = {}) {
    this.#options = {
      ...options,
      boot: options.boot ?? bootJanet,
      log: options.log ?? ((message) => process.stderr.write(`${message}\n`)),
      publishInteraction: options.publishInteraction ?? publishBuzzInteraction,
    };
  }

  get size(): number {
    return this.#sessions.size;
  }

  async create(input: {
    cwd: string;
    mcpServers: unknown[];
    additionalDirectories?: string[];
  }): Promise<JanetAcpSession> {
    if (!isAbsolute(input.cwd)) {
      throw RequestError.invalidParams({ cwd: input.cwd }, "Session cwd must be absolute.");
    }
    let cwd: string;
    try {
      cwd = realpathSync(input.cwd);
      if (!statSync(cwd).isDirectory()) throw new Error("not a directory");
    } catch {
      throw RequestError.invalidParams({ cwd: input.cwd }, "Session cwd must be an existing directory.");
    }
    if (input.mcpServers.length) {
      this.#options.log(
        `Janet ACP: ignoring ${input.mcpServers.length} client MCP server(s); ACP MCP bridging is not enabled yet.`,
      );
    }
    if (input.additionalDirectories?.length) {
      this.#options.log(
        "Janet ACP: additionalDirectories are not enabled; Janet remains scoped to the session cwd.",
      );
    }

    const boot = await this.#options.boot({
      dir: cwd,
      bundle: this.#options.bundle,
      interactive: true,
    });
    try {
      const thread = await boot.session.thread.create();
      if (this.#options.modelId) {
        await boot.session.model.switch({ modelId: this.#options.modelId });
      }
      if (!boot.session.model.hasSelection()) {
        throw new Error(
          "No model selected. Run `janet` once to choose a model, pass `janet acp --model provider/model`, or set JANET_MODEL.",
        );
      }
      const session = new JanetAcpSession(thread.id, {
        cwd,
        ...(this.#options.bundle ? { bundle: this.#options.bundle } : {}),
        ...(this.#options.modelId ? { modelId: this.#options.modelId } : {}),
        boot,
        log: this.#options.log,
        publishInteraction: this.#options.publishInteraction,
      });
      this.#sessions.set(session.id, session);
      return session;
    } catch (error) {
      boot.herdrDetach();
      await boot.observability.flush().catch(() => {});
      await boot.controller.destroy().catch(() => {});
      throw error;
    }
  }

  get(sessionId: string): JanetAcpSession {
    const session = this.#sessions.get(sessionId);
    if (!session) {
      throw RequestError.invalidParams({ sessionId }, `Unknown Janet ACP session: ${sessionId}`);
    }
    return session;
  }

  cancel(sessionId: string): void {
    this.#sessions.get(sessionId)?.cancel();
  }

  async disposeAll(): Promise<void> {
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    await Promise.allSettled(sessions.map((session) => session.dispose()));
  }

  supportsFormElicitation(): boolean {
    return supportsFormElicitation(this.clientCapabilities);
  }
}

export function acpPromptText(prompt: Parameters<typeof promptToText>[0]): string {
  return promptToText(prompt);
}
