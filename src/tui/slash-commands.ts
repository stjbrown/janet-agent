import type { SlashCommand } from "@earendil-works/pi-tui";

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "models", description: "Pick one or more providers, then a model" },
  {
    name: "model",
    argumentHint: "[provider/id | forget provider/id]",
    description: "Pick, switch, or forget a saved model",
  },
  { name: "providers", description: "Browse provider status and setup" },
  {
    name: "login",
    argumentHint: "<provider> [mode]",
    description: "Log in; OpenAI mode is browser or device",
  },
  {
    name: "logout",
    argumentHint: "<provider>",
    description: "Remove stored credentials for a provider",
  },
  { name: "auth", description: "Show which providers are authenticated" },
  {
    name: "observability",
    argumentHint: "[status | off]",
    description: "Configure opt-in tracing",
  },
  { name: "traces", description: "Browse recent local traces" },
  {
    name: "compact",
    description: "Flush this conversation into Observational Memory",
  },
  { name: "clear", description: "Start a blank conversation (keeps the old thread)" },
  { name: "cancel", description: "Cancel the active run" },
  { name: "help", description: "Show command help" },
  { name: "quit", description: "Exit (double Ctrl+C also works)" },
];

export function slashCommandHelp(commands: SlashCommand[] = SLASH_COMMANDS): string {
  const usages = commands.map(({ name, argumentHint }) =>
    `/${name}${argumentHint ? ` ${argumentHint}` : ""}`,
  );
  const width = Math.max(...usages.map((usage) => usage.length));
  const lines = commands.map(
    (command, index) =>
      `  ${usages[index]!.padEnd(width)}   ${command.description ?? ""}`.trimEnd(),
  );
  return `Commands:\n${lines.join("\n")}

While Janet is working, Esc or Ctrl+C cancels the active run.
Anything else is a message to Janet.`;
}
