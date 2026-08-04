import { describe, expect, it } from "vitest";
import { parseArgs, validateInvocation } from "../src/headless/flags.js";

describe("parseArgs", () => {
  it("parses command, paths, thread, and safety flags", () => {
    const parsed = parseArgs([
      "--dir",
      "/project",
      "--bundle=docs/kb",
      "--thread",
      "thread-1",
      "--allow-exec",
      "ingest",
      "notes.md",
    ]);

    expect(parsed.subcommand).toBe("ingest");
    expect(parsed.positionals).toEqual(["notes.md"]);
    expect(parsed.values).toMatchObject({
      dir: "/project",
      bundle: "docs/kb",
      thread: "thread-1",
    });
    expect(parsed.flags.has("allow-exec")).toBe(true);
    expect(validateInvocation(parsed)).toEqual([]);
  });

  it("rejects unknown flags and missing values without consuming the command", () => {
    const parsed = parseArgs(["--model", "query", "--wat", "question"]);

    expect(parsed.subcommand).toBe("query");
    expect(parsed.positionals).toEqual(["question"]);
    expect(validateInvocation(parsed)).toEqual([
      "--model requires a value.",
      "Unknown option: --wat",
    ]);
  });

  it("rejects empty values and unknown short options", () => {
    const parsed = parseArgs(["--bundle=", "-x", "init"]);
    expect(validateInvocation(parsed)).toEqual([
      "--bundle requires a value.",
      "Unknown option: -x",
    ]);
  });

  it("enforces required positionals and flag scope", () => {
    expect(validateInvocation(parseArgs(["ingest"]))).toEqual([
      "`janet ingest` requires at least one source.",
    ]);
    expect(validateInvocation(parseArgs(["query"]))).toEqual([
      "`janet query` requires a question.",
    ]);
    expect(validateInvocation(parseArgs(["init", "extra"]))).toEqual([
      "`janet init` does not accept positional arguments.",
    ]);
    expect(validateInvocation(parseArgs(["query", "--fix", "what?"]))).toEqual([
      "--fix is only valid with `janet lint`.",
    ]);
    expect(
      validateInvocation(parseArgs(["query", "--allow-exec", "what?"])),
    ).toEqual([
      "--allow-exec is only valid with a mutating one-shot command.",
    ]);
  });

  it("rejects conflicting thread aliases and excess viz scope arguments", () => {
    expect(
      validateInvocation(
        parseArgs([
          "--thread",
          "one",
          "--resume",
          "two",
          "viz",
          "one",
          "two",
        ]),
      ),
    ).toEqual([
      "Use either --thread or --resume, not both.",
      "`janet viz` accepts at most one scope argument (quote multi-word scopes).",
    ]);
  });

  it("accepts ACP model and bundle configuration", () => {
    expect(
      validateInvocation(
        parseArgs(["acp", "--bundle", "docs/knowledge", "--model", "anthropic/claude-sonnet-5"]),
      ),
    ).toEqual([]);
  });

  it("rejects client-owned and one-shot options in ACP mode", () => {
    expect(
      validateInvocation(
        parseArgs(["-C", "/tmp", "acp", "extra", "--print", "--allow-exec", "--thread", "one"]),
      ),
    ).toEqual([
      "`janet acp` does not accept positional arguments.",
      "--print is not valid with `janet acp`.",
      "--allow-exec is not valid with `janet acp`; ACP surfaces interactive approval.",
      "--thread/--resume is not valid with `janet acp`; the ACP client owns sessions.",
      "-C/--dir is not valid with `janet acp`; the ACP client supplies the session cwd.",
    ]);
  });
});
