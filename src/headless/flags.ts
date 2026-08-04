export interface ParsedArgs {
  /** First positional token (subcommand or undefined). */
  subcommand?: string;
  /** Remaining positional tokens. */
  positionals: string[];
  /** Boolean flags present (e.g. "fix", "print", "help"). */
  flags: Set<string>;
  /** Value flags (e.g. --model x, --dir path, --bundle path, --thread id). */
  values: Record<string, string>;
  /** Syntax errors found without guessing at the user's intent. */
  errors: string[];
}

const VALUE_FLAGS = new Set(["model", "dir", "bundle", "thread", "resume"]);
const BOOLEAN_FLAGS = new Set([
  "fix",
  "print",
  "help",
  "version",
  "allow-exec",
]);
const COMMANDS = new Set(["init", "ingest", "query", "lint", "viz", "acp", "help"]);

function displayFlag(name: string): string {
  return name === "dir" ? "-C/--dir" : `--${name}`;
}

/**
 * Minimal arg parser. Supports `--flag`, `--key value`, `--key=value`, short
 * `-p`/`-h`/`-C`, and positionals. Deliberately dependency-free.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  const errors: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i]!;
    if (tok === "--") {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (tok.startsWith("--")) {
      const body = tok.slice(2);
      const eq = body.indexOf("=");
      if (eq >= 0) {
        const name = body.slice(0, eq);
        const value = body.slice(eq + 1);
        if (!VALUE_FLAGS.has(name)) {
          errors.push(`Unknown option: --${name}`);
        } else if (!value) {
          errors.push(`${displayFlag(name)} requires a value.`);
        } else {
          values[name] = value;
        }
      } else if (VALUE_FLAGS.has(body)) {
        const next = argv[i + 1];
        if (
          next === undefined ||
          next.startsWith("-") ||
          (positionals.length === 0 && COMMANDS.has(next))
        ) {
          errors.push(`${displayFlag(body)} requires a value.`);
        } else {
          values[body] = next;
          i++;
        }
      } else if (BOOLEAN_FLAGS.has(body)) {
        flags.add(body);
      } else {
        errors.push(`Unknown option: --${body}`);
      }
    } else if (tok.startsWith("-") && tok.length > 1) {
      const short = tok.slice(1);
      if (short === "p") flags.add("print");
      else if (short === "h") flags.add("help");
      else if (short === "v") flags.add("version");
      else if (short === "C") {
        const next = argv[i + 1];
        if (
          next === undefined ||
          next.startsWith("-") ||
          (positionals.length === 0 && COMMANDS.has(next))
        ) {
          errors.push("-C/--dir requires a value.");
        } else {
          values["dir"] = next;
          i++;
        }
      } else {
        errors.push(`Unknown option: -${short}`);
      }
    } else {
      positionals.push(tok);
    }
  }

  return {
    subcommand: positionals[0],
    positionals: positionals.slice(1),
    flags,
    values,
    errors,
  };
}

/** Validate command-specific argument and flag combinations. */
export function validateInvocation(parsed: ParsedArgs): string[] {
  const errors = [...parsed.errors];
  const sub = parsed.subcommand;

  if (parsed.values["thread"] && parsed.values["resume"]) {
    errors.push("Use either --thread or --resume, not both.");
  }
  if (parsed.flags.has("fix") && sub !== "lint") {
    errors.push("--fix is only valid with `janet lint`.");
  }
  if (parsed.flags.has("allow-exec") && (!sub || sub === "query")) {
    errors.push("--allow-exec is only valid with a mutating one-shot command.");
  }
  if (sub === "acp") {
    if (parsed.positionals.length) {
      errors.push("`janet acp` does not accept positional arguments.");
    }
    if (parsed.flags.has("print")) {
      errors.push("--print is not valid with `janet acp`.");
    }
    if (parsed.flags.has("allow-exec")) {
      errors.push("--allow-exec is not valid with `janet acp`; ACP surfaces interactive approval.");
    }
    if (parsed.values["thread"] || parsed.values["resume"]) {
      errors.push("--thread/--resume is not valid with `janet acp`; the ACP client owns sessions.");
    }
    if (parsed.values["dir"]) {
      errors.push("-C/--dir is not valid with `janet acp`; the ACP client supplies the session cwd.");
    }
  }

  switch (sub) {
    case "init":
    case "lint":
      if (parsed.positionals.length) {
        errors.push(`\`janet ${sub}\` does not accept positional arguments.`);
      }
      break;
    case "ingest":
      if (!parsed.positionals.length) {
        errors.push("`janet ingest` requires at least one source.");
      }
      break;
    case "query":
      if (!parsed.positionals.join(" ").trim()) {
        errors.push("`janet query` requires a question.");
      }
      break;
    case "viz":
      if (parsed.positionals.length > 1) {
        errors.push("`janet viz` accepts at most one scope argument (quote multi-word scopes).");
      }
      break;
  }

  return errors;
}
