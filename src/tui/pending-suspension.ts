export interface PendingToolSuspension {
  toolCallId: string;
  toolName: string;
  args: unknown;
  suspendPayload: unknown;
  resumeSchema?: string;
}

/**
 * Recover the next suspension that a transient controller event did not render.
 * The AgentController display state is canonical and survives event-listener races.
 */
export function nextUnhandledSuspension(
  suspensions: ReadonlyMap<string, PendingToolSuspension>,
  handledToolCallIds: ReadonlySet<string>,
): PendingToolSuspension | null {
  for (const suspension of suspensions.values()) {
    if (!handledToolCallIds.has(suspension.toolCallId)) return suspension;
  }
  return null;
}
