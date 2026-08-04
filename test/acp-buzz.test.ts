import { describe, expect, it, vi } from "vitest";
import {
  buzzEventContent,
  buzzReplyTarget,
  publishBuzzInteraction,
} from "../src/acp/buzz.js";

const eventId = "a".repeat(64);
const prompt = `[Base]\nBuzz instructions\n\n[Context]\nScope: channel\nChannel: Eve Knowledge (#ce747caf-7143-4be1-b311-316834c12ad7)\nIMPORTANT: use \`--reply-to ${eventId}\` on \`buzz messages send\`.\n\n[Buzz event: @mention]\nEvent ID: ${eventId}\nChannel: Eve Knowledge (#ce747caf-7143-4be1-b311-316834c12ad7)\nFrom: Steve\nContent: @Janet Approve\nTags: []`;

describe("Buzz ACP interaction bridge", () => {
  it("extracts the reply target and human-authored answer", () => {
    expect(buzzReplyTarget(prompt)).toEqual({
      channelId: "ce747caf-7143-4be1-b311-316834c12ad7",
      replyTo: eventId,
    });
    expect(buzzEventContent(prompt)).toBe("Approve");
  });

  it("publishes into the originating thread with only Buzz credentials", async () => {
    const run = vi.fn(async () => {});
    await expect(
      publishBuzzInteraction(prompt, "Choose an option", {
        env: {
          PATH: "/usr/bin",
          BUZZ_PRIVATE_KEY: "private-key",
          BUZZ_RELAY_URL: "ws://127.0.0.1:3000",
          BUZZ_AUTH_TAG: "owner",
          OPENAI_API_KEY: "do-not-forward",
        },
        run,
      }),
    ).resolves.toBe(true);
    expect(run).toHaveBeenCalledWith(
      [
        "messages",
        "send",
        "--channel",
        "ce747caf-7143-4be1-b311-316834c12ad7",
        "--reply-to",
        eventId,
        "--content",
        "Choose an option",
      ],
      {
        PATH: "/usr/bin",
        BUZZ_PRIVATE_KEY: "private-key",
        BUZZ_RELAY_URL: "ws://127.0.0.1:3000",
        BUZZ_AUTH_TAG: "owner",
      },
    );
  });

  it("is a no-op outside a Buzz managed-agent turn", async () => {
    const run = vi.fn(async () => {});
    await expect(
      publishBuzzInteraction("ordinary ACP prompt", "Question", {
        env: {},
        run,
      }),
    ).resolves.toBe(false);
    expect(run).not.toHaveBeenCalled();
  });
});
