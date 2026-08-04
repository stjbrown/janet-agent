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

const BUZZ_PROJECT_GUIDANCE = `[Janet Buzz project routing]
You are running from the Buzz nest, not from a project repository. Treat the nest as a container for projects, never as the target project itself.

- Never create or maintain a knowledge bundle at the Buzz workspace root (for example, \`knowledge/\`).
- Buzz project checkouts live at \`REPOS/<project>/\`; a project's default bundle is \`REPOS/<project>/knowledge/\`.
- Resolve the target project before any bundle write. If the user names an existing project, verify its directory and \`.git\` exist under \`REPOS/\`.
- If the user asks to start a new Buzz project, or the target is ambiguous, propose a short project name and ask them to create or open that project in Buzz. Do not scaffold the bundle until they reply and the checkout exists under \`REPOS/\`.
- \`buzz repos create\` only announces a NIP-34 repository. It does not create or attach a local Buzz project, so do not use it as a substitute for the user's project-creation step.
- Once the project is verified, prefix every bundle read/write path with \`REPOS/<project>/\` and keep status messages explicit about the chosen project and bundle path.`;

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

/** Add host-specific placement rules only inside an authenticated Buzz turn. */
export function withBuzzProjectGuidance(
  prompt: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!env.BUZZ_PRIVATE_KEY || !env.BUZZ_RELAY_URL || !buzzReplyTarget(prompt)) {
    return prompt;
  }
  return `${prompt}\n\n${BUZZ_PROJECT_GUIDANCE}`;
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
