import { execFile } from "node:child_process";

const CHANNEL_ID = /Channel:.*\(#([0-9a-f]{8}-[0-9a-f-]{27})\)/giu;
const REPLY_TO = /use `--reply-to ([0-9a-f]{64})`/giu;
const EVENT_ID = /^Event ID:\s*([0-9a-f]{64})\s*$/gimu;

export interface BuzzReplyTarget {
  channelId: string;
  replyTo: string;
}

export type BuzzCommandRunner = (
  args: string[],
  env: NodeJS.ProcessEnv,
) => Promise<void>;

export interface BuzzPublisherOptions {
  env?: NodeJS.ProcessEnv;
  run?: BuzzCommandRunner;
}

function lastMatch(pattern: RegExp, text: string): string | undefined {
  const matches = [...text.matchAll(pattern)];
  return matches.at(-1)?.[1];
}

/** Extract the current reply destination from the envelope used by buzz-acp. */
export function buzzReplyTarget(prompt: string): BuzzReplyTarget | undefined {
  const eventStart = prompt.lastIndexOf("[Buzz event:");
  if (eventStart < 0) return;
  const event = prompt.slice(eventStart);
  const channelId = lastMatch(CHANNEL_ID, prompt);
  const replyTo = lastMatch(REPLY_TO, prompt) ?? lastMatch(EVENT_ID, event);
  if (!channelId || !replyTo) return;
  return { channelId, replyTo };
}

/** Extract only the human-authored content from buzz-acp's full turn envelope. */
export function buzzEventContent(prompt: string): string | undefined {
  const eventStart = prompt.lastIndexOf("[Buzz event:");
  if (eventStart < 0) return;
  const event = prompt.slice(eventStart);
  const match = event.match(/\nContent:\s*([\s\S]*?)\nTags:/u);
  if (!match?.[1]) return;
  return match[1].trim().replace(/^@Janet\b[:,]?\s*/iu, "");
}

function buzzCommandEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const names = ["PATH", "BUZZ_PRIVATE_KEY", "BUZZ_RELAY_URL", "BUZZ_AUTH_TAG"] as const;
  return Object.fromEntries(
    names.flatMap((name) => source[name] === undefined ? [] : [[name, source[name]!]]),
  );
}

const runBuzzCommand: BuzzCommandRunner = (args, env) =>
  new Promise((resolve, reject) => {
    execFile(
      "buzz",
      args,
      { env, encoding: "utf8", timeout: 15_000, maxBuffer: 1_000_000 },
      (error) => error ? reject(error) : resolve(),
    );
  });

/**
 * Publish an ACP interaction into the originating Buzz thread when Janet is
 * running as a Buzz managed agent. Generic ACP clients have no Buzz envelope
 * or credentials, so this becomes a no-op for them.
 */
export async function publishBuzzInteraction(
  prompt: string,
  content: string,
  options: BuzzPublisherOptions = {},
): Promise<boolean> {
  const env = options.env ?? process.env;
  const target = buzzReplyTarget(prompt);
  if (!target || !env.BUZZ_PRIVATE_KEY || !env.BUZZ_RELAY_URL) return false;
  await (options.run ?? runBuzzCommand)([
    "messages",
    "send",
    "--channel",
    target.channelId,
    "--reply-to",
    target.replyTo,
    "--content",
    content,
  ], buzzCommandEnvironment(env));
  return true;
}
