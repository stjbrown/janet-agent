import { describe, expect, it } from "vitest";
import { CombinedAutocompleteProvider } from "@earendil-works/pi-tui";
import {
  SLASH_COMMANDS,
  slashCommandHelp,
} from "../src/tui/slash-commands.js";

describe("TUI slash commands", () => {
  it("completes a typed command prefix", async () => {
    const provider = new CombinedAutocompleteProvider(SLASH_COMMANDS, process.cwd());

    const suggestions = await provider.getSuggestions(["/ob"], 0, 3, {
      signal: new AbortController().signal,
    });

    expect(suggestions?.prefix).toBe("/ob");
    expect(suggestions?.items.map((item) => item.value)).toEqual([
      "observability",
    ]);
  });

  it("generates help from the same registry", () => {
    const help = slashCommandHelp();

    for (const command of SLASH_COMMANDS) {
      expect(help).toContain(`/${command.name}`);
    }
    expect(help).toContain("/model [provider/id | forget provider/id]");
    expect(help).toContain("/login [provider] [mode]");
    expect(help).toContain("/observability [status | off]");
  });
});
