const ACTIVE_RUN_MESSAGE =
  "Janet is still working. Cancel the active run before sending another message.";

/** Ordinary chat submissions cannot start a competing run on one session. */
export function activeRunSubmissionMessage(
  running: boolean,
): string | undefined {
  return running ? ACTIVE_RUN_MESSAGE : undefined;
}
