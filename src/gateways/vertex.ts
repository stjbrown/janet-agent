import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createVertex } from "@ai-sdk/google-vertex";
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";
import { wrapLanguageModel } from "ai";
import { MastraModelGateway } from "@mastra/core/llm";
import type {
  GatewayAuthRequest,
  GatewayAuthResult,
  GatewayLanguageModel,
  ProviderConfig,
} from "@mastra/core/llm";

export const VERTEX_GATEWAY_ID = "vertex";

/**
 * Current text-generation models exposed by Janet's custom Vertex gateway.
 * This runtime list is shared with onboarding because ADC-backed Vertex models
 * are not supplied by models.dev's API-key catalog.
 */
export const VERTEX_MODELS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
  { id: "claude-fable-5", label: "Claude Fable 5" },
  { id: "claude-opus-5", label: "Claude Opus 5" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8" },
  { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { id: "claude-opus-4-5@20251101", label: "Claude Opus 4.5" },
  { id: "claude-sonnet-4-5@20250929", label: "Claude Sonnet 4.5" },
  { id: "claude-opus-4-1@20250805", label: "Claude Opus 4.1" },
  { id: "claude-opus-4@20250514", label: "Claude Opus 4" },
  { id: "claude-sonnet-4@20250514", label: "Claude Sonnet 4" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash" },
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
] as const;

/**
 * Google Vertex AI gateway — NET-NEW (mastracode has no Vertex). Modeled on the
 * Bedrock gateway: authenticates via Google Application Default Credentials
 * (ADC) or a service-account file rather than a bearer key.
 *
 * Model id form is `vertex/<model>`. Anthropic (Claude) models on Vertex go
 * through `@ai-sdk/google-vertex/anthropic` (`createVertexAnthropic`); Gemini
 * and everything else go through `createVertex`. Project/location come from
 * `GOOGLE_VERTEX_PROJECT` / `GOOGLE_VERTEX_LOCATION` (the AI SDK reads these
 * itself; we also honor `GOOGLE_CLOUD_*` fallbacks).
 */
export function hasGoogleCredentials(): boolean {
  if (
    process.env["GOOGLE_APPLICATION_CREDENTIALS"] ||
    process.env["GOOGLE_VERTEX_PROJECT"] ||
    process.env["GOOGLE_CLOUD_PROJECT"]
  ) {
    return true;
  }
  const home = process.env["HOME"] || process.env["USERPROFILE"] || homedir();
  return existsSync(join(home, ".config", "gcloud", "application_default_credentials.json"));
}

/** The quota/default project from the gcloud ADC file, if present. */
function adcQuotaProject(): string | undefined {
  const home = process.env["HOME"] || process.env["USERPROFILE"] || homedir();
  const adcPath = join(home, ".config", "gcloud", "application_default_credentials.json");
  try {
    const adc = JSON.parse(readFileSync(adcPath, "utf-8")) as { quota_project_id?: string };
    return adc.quota_project_id || undefined;
  } catch {
    return undefined;
  }
}

function vertexProject(): string | undefined {
  return (
    process.env["GOOGLE_VERTEX_PROJECT"] ||
    process.env["GOOGLE_CLOUD_PROJECT"] ||
    // Fall back to the ADC quota project so a bare run (env unset) doesn't send
    // `projects/undefined`.
    adcQuotaProject() ||
    undefined
  );
}

function vertexLocation(): string {
  return (
    process.env["GOOGLE_VERTEX_LOCATION"] ||
    process.env["GOOGLE_CLOUD_LOCATION"] ||
    // Default to the `global` endpoint: it serves the newest Claude models
    // (e.g. claude-opus-5) that regional endpoints like us-east5 may not, and
    // the AI SDK special-cases it to the region-less aiplatform.googleapis.com
    // host. Overridable via env for region-pinned deployments.
    "global"
  );
}

/**
 * Claude-on-Vertex rejects requests whose message array ends with an assistant
 * turn ("does not support assistant message prefill"). Extended-thinking models
 * (e.g. opus-4-8) leave a trailing reasoning block when a tool suspends and the
 * turn resumes (ask_user), which trips this. Not replaying reasoning back to the
 * model avoids it. Applied to all Vertex Claude models — harmless when there's
 * no reasoning to replay.
 */
/**
 * Claude-on-Vertex rejects a request whose message array ends with an assistant
 * turn ("does not support assistant message prefill. The conversation must end
 * with a user message"). In a normal agent loop the model call always ends with
 * a user or tool-result message; a trailing assistant message is only ever an
 * (unintended) prefill — extended-thinking models (opus-4-8) can leave one after
 * a tool approval / suspension resumes. Janet never prefills deliberately, so we
 * defensively drop any trailing assistant message(s).
 *
 * NOTE: we deliberately do NOT strip reasoning (`sendReasoning`) — extended
 * thinking replays its thinking blocks across tool steps, and dropping them
 * makes the model lose the thread of what it already tried and spin in loops.
 */
export function removeVertexAnthropicPrefill(
  params: Record<string, unknown>,
): Record<string, unknown> {
  const prompt = params["prompt"];
  if (!Array.isArray(prompt)) return params;

  const messages = prompt as Array<{ role?: string }>;
  let keep = messages.length;
  while (keep > 1 && messages[keep - 1]?.role === "assistant") keep--;
  const dropped = messages.length - keep;
  if (!dropped) return params;

  if (process.env["JANET_DEBUG_MODEL"]) {
    process.stderr.write(
      `[model] dropped ${dropped} trailing assistant (prefill) message(s)\n`,
    );
  }

  // Provider prompts may share arrays with memory/history construction.
  // Never mutate them in place: signed Anthropic thinking blocks must be
  // replayed exactly as returned across tool-use steps.
  return { ...params, prompt: messages.slice(0, keep) };
}

const vertexAnthropicMiddleware = {
  transformParams: async ({ params }: { params: Record<string, unknown> }) =>
    removeVertexAnthropicPrefill(params),
};

/** Build a Vertex language model for a bare model id (no `vertex/` prefix). */
export function createVertexModel(
  bareModelId: string,
  headers?: Record<string, string>,
): GatewayLanguageModel {
  const project = vertexProject();
  const location = vertexLocation();
  const isAnthropic = /^claude/i.test(bareModelId);
  if (isAnthropic) {
    const provider = createVertexAnthropic({ project, location, headers });
    return wrapLanguageModel({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      model: provider(bareModelId) as any,
      middleware: vertexAnthropicMiddleware as never,
    }) as unknown as GatewayLanguageModel;
  }
  const provider = createVertex({ project, location, headers });
  return provider(bareModelId) as unknown as GatewayLanguageModel;
}

export class VertexGateway extends MastraModelGateway {
  readonly id = VERTEX_GATEWAY_ID;
  readonly name = "Google Vertex AI";

  shouldEnable(): boolean {
    return hasGoogleCredentials();
  }

  handlesModel(modelId: string): boolean {
    return modelId === VERTEX_GATEWAY_ID || modelId.startsWith(`${VERTEX_GATEWAY_ID}/`);
  }

  async fetchProviders(): Promise<Record<string, ProviderConfig>> {
    return {
      vertex: {
        name: "Google Vertex AI",
        apiKeyEnvVar: "",
        apiKeyHeader: "Authorization",
        gateway: this.id,
        models: VERTEX_MODELS.map((model) => model.id),
      },
    };
  }

  buildUrl(_modelId: string): string | undefined {
    return undefined;
  }

  async getApiKey(_modelId: string): Promise<string> {
    return hasGoogleCredentials() ? "google-adc" : "";
  }

  resolveAuth(_request: GatewayAuthRequest): GatewayAuthResult | undefined {
    return hasGoogleCredentials() ? { apiKey: "google-adc", source: "gateway" } : undefined;
  }

  resolveLanguageModel(args: {
    modelId: string;
    providerId: string;
    apiKey: string;
    headers?: Record<string, string>;
  }): GatewayLanguageModel {
    const bare = args.modelId.startsWith(`${VERTEX_GATEWAY_ID}/`)
      ? args.modelId.slice(VERTEX_GATEWAY_ID.length + 1)
      : args.modelId;
    return createVertexModel(bare, args.headers);
  }
}

export function createVertexGateway(): VertexGateway {
  return new VertexGateway();
}
