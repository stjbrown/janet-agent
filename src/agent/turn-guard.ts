interface SkillToolInput {
  name?: unknown;
  skillName?: unknown;
  path?: unknown;
  query?: unknown;
  command?: unknown;
}

const SKILL_ALREADY_LOADED =
  "This skill procedure is already loaded for the current turn. Continue from the procedure already in context.";
const COMMAND_ALREADY_RAN =
  "This exact command already ran immediately before this call. Use its result instead of repeating it.";

function requestContextFromToolContext(context: unknown): object | undefined {
  if (!context || typeof context !== "object" || !("requestContext" in context)) {
    return;
  }
  const requestContext = context.requestContext;
  return requestContext && typeof requestContext === "object"
    ? requestContext
    : undefined;
}

function stringField(input: unknown, field: keyof SkillToolInput): string | undefined {
  if (!input || typeof input !== "object" || !(field in input)) return;
  const value = (input as SkillToolInput)[field];
  return typeof value === "string" ? value : undefined;
}

function invocationKey(toolName: string, input: unknown): string | undefined {
  if (toolName === "skill") {
    const name = stringField(input, "name");
    return name ? `skill:${name}` : undefined;
  }
  if (toolName === "skill_read") {
    const skillName = stringField(input, "skillName");
    const path = stringField(input, "path");
    return skillName && path ? `skill_read:${skillName}:${path}` : undefined;
  }
  if (toolName === "skill_search") {
    const query = stringField(input, "query");
    return query ? `skill_search:${query}` : undefined;
  }
  return;
}

function executionKey(toolName: string, input: unknown): string | undefined {
  if (toolName !== "mastra_workspace_execute_command") return;
  const command = stringField(input, "command");
  return command ? `execute:${command.trim()}` : undefined;
}

function loadedProcedureName(toolName: string, input: unknown): string | undefined {
  if (toolName === "skill") return stringField(input, "name");
  if (toolName !== "skill_read") return;

  const skillName = stringField(input, "skillName");
  const path = stringField(input, "path");
  if (!skillName || !path) return;
  const normalizedPath = path.replaceAll("\\", "/");
  return normalizedPath === "SKILL.md" || normalizedPath.endsWith("/SKILL.md")
    ? skillName
    : undefined;
}

/**
 * Skill procedures may be chained, but reloading the same procedure within a
 * turn adds noise and can trigger model loops. Track exact reads and loaded
 * procedure names on Mastra's request context, which is stable for one turn.
 */
export function createSkillTurnGuard() {
  const callsByTurn = new WeakMap<object, Set<string>>();
  const proceduresByTurn = new WeakMap<object, Set<string>>();
  const lastExecutionByTurn = new WeakMap<object, string>();

  const stateFor = (requestContext: object) => {
    let calls = callsByTurn.get(requestContext);
    if (!calls) {
      calls = new Set();
      callsByTurn.set(requestContext, calls);
    }
    let procedures = proceduresByTurn.get(requestContext);
    if (!procedures) {
      procedures = new Set();
      proceduresByTurn.set(requestContext, procedures);
    }
    return { calls, procedures };
  };

  return {
    beforeToolCall(toolName: string, input: unknown, context: unknown) {
      const requestContext = requestContextFromToolContext(context);
      if (!requestContext) return;

      const commandKey = executionKey(toolName, input);
      if (commandKey) {
        if (lastExecutionByTurn.get(requestContext) === commandKey) {
          return { proceed: false as const, output: COMMAND_ALREADY_RAN };
        }
        lastExecutionByTurn.set(requestContext, commandKey);
      } else {
        // An intervening read/edit/skill can materially change what rerunning a
        // command means, so only consecutive identical executions are blocked.
        lastExecutionByTurn.delete(requestContext);
      }

      const key = invocationKey(toolName, input);
      if (!key) return;

      const { calls, procedures } = stateFor(requestContext);
      const procedureName = loadedProcedureName(toolName, input);
      if (
        calls.has(key) ||
        (procedureName !== undefined && procedures.has(procedureName))
      ) {
        return { proceed: false as const, output: SKILL_ALREADY_LOADED };
      }

      calls.add(key);
      if (procedureName) procedures.add(procedureName);
    },

    afterToolCall(
      toolName: string,
      input: unknown,
      context: unknown,
      error?: unknown,
    ) {
      if (!error) return;
      const requestContext = requestContextFromToolContext(context);
      if (!requestContext) return;

      const commandKey = executionKey(toolName, input);
      if (commandKey && lastExecutionByTurn.get(requestContext) === commandKey) {
        lastExecutionByTurn.delete(requestContext);
      }

      const key = invocationKey(toolName, input);
      if (!key) return;

      const { calls, procedures } = stateFor(requestContext);
      calls.delete(key);
      const procedureName = loadedProcedureName(toolName, input);
      if (procedureName) procedures.delete(procedureName);
    },
  };
}
