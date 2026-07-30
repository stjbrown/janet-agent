import { describe, expect, it } from "vitest";
import {
  VERTEX_MODELS,
  createVertexGateway,
  removeVertexAnthropicPrefill,
} from "../src/gateways/vertex.js";

describe("Vertex Anthropic prompt handling", () => {
  it("drops trailing assistant prefill without mutating the source prompt", () => {
    const user = { role: "user", content: "continue" };
    const signedThinking = {
      role: "assistant",
      content: [
        {
          type: "reasoning",
          text: "",
          providerMetadata: { anthropic: { signature: "signed" } },
        },
      ],
    };
    const prompt = [user, signedThinking];
    const params = { prompt, maxOutputTokens: 1024 };

    const result = removeVertexAnthropicPrefill(params);

    expect(result).not.toBe(params);
    expect(result["prompt"]).toEqual([user]);
    expect(prompt).toEqual([user, signedThinking]);
    expect(params.prompt).toBe(prompt);
  });

  it("returns untouched params when there is no assistant prefill", () => {
    const params = { prompt: [{ role: "user", content: "hello" }] };

    expect(removeVertexAnthropicPrefill(params)).toBe(params);
  });

  it("preserves a trailing assistant tool call so its result can be correlated", () => {
    const toolCall = {
      role: "assistant",
      content: [
        {
          type: "reasoning",
          text: "",
          providerMetadata: { anthropic: { signature: "signed" } },
        },
        {
          type: "tool-call",
          toolCallId: "toolu_vrtx_01Correlation",
          toolName: "mastra_workspace_execute_command",
          input: { command: "pnpm test" },
        },
      ],
    };
    const params = {
      prompt: [{ role: "user", content: "run the tests" }, toolCall],
    };

    expect(removeVertexAnthropicPrefill(params)).toBe(params);
    expect(params.prompt.at(-1)).toBe(toolCall);
  });

  it("advertises every curated Vertex model through the gateway catalog", async () => {
    const providers = await createVertexGateway().fetchProviders();

    expect(providers["vertex"]?.models).toEqual(
      VERTEX_MODELS.map((model) => model.id),
    );
    expect(providers["vertex"]?.models).toContain("claude-sonnet-5");
  });
});
