# Janet

Janet is a local knowledge agent built on [Mastra](https://mastra.ai/) for building and maintaining
portable project wikis in plain Markdown using the Open Knowledge Format (OKF). Mastra provides
the agent runtime, model routing, memory, and observability foundation; Janet adds focused OKF
workflows, project-scoped safety, and a terminal experience for working with the knowledge.

She operates on a selected project directory—the current directory by default, or the directory
given with `-C`. Its knowledge bundle defaults to `knowledge/`, but `--bundle <path>` can select
another directory inside that project. Conversation history stays scoped to the project. The
knowledge remains open, diffable, and usable without Janet.

> Janet is prerelease software. The current release candidate is `0.1.0-beta.6`; published previews
> use the `next` tag.
> This beta is supported and tested on macOS only.

## Project instructions

Add a `JANET.md` file at the root of the selected project to customize how Janet works there:

```markdown
# Role

Act as a competitive-intelligence expert for this project.

# Priorities

- Separate verified facts from inference.
- Track competitor positioning, pricing, and product changes.
- Prefer concise comparison tables when several companies are involved.
```

Janet loads only the exact project-root `JANET.md` selected by the current directory or `-C`.
She never treats `AGENTS.md`, `CLAUDE.md`, source files, or fetched content as instructions. Those
remain repository data. Project instructions can customize expertise, priorities, terminology,
outputs, and conversational style, but cannot override Janet's safety rules, tool permissions,
knowledge trust model, bundle write boundaries, or active skill procedures.

`JANET.md` must be a regular UTF-8 file no larger than 64 KiB. It is not part of the knowledge bundle
and is not used as repository evidence unless you explicitly ask Janet to document it.

## Install

Run the preview without installing it globally:

```bash
npx janet-agent@next
```

Or install it:

```bash
npm install --global janet-agent@next
janet
```

macOS and Node.js 22.13 or newer are required for this beta. npm rejects installation on other
operating systems.

### Migrating from the former package

Janet was previously published as `@stjbrown/agent-knowledge`. That legacy package has been
withdrawn; replace it with `janet-agent@next`. The
[Agent Knowledge](https://github.com/stjbrown/agent-knowledge) repository now owns only the
portable skills.

## Use

First run walks you through choosing a model from the providers you have configured.

```bash
janet init                       # scaffold a knowledge/ bundle
janet ingest ./notes/rfc-42.md   # integrate a source
janet query "how does auth work, and what supports it?"
janet lint                       # deterministic conformance + semantic drift audit
janet viz                        # write an interactive graph
```

### ACP clients and Buzz

`janet acp` runs Janet as an experimental
[Agent Client Protocol](https://github.com/agentclientprotocol/agent-client-protocol) v1 agent over
stdio. An ACP client supplies the project directory for each session, so `-C/--dir` is intentionally
not accepted in this mode. Janet still honors `JANET.md`, keeps one conversation per ACP session,
streams replies and tool activity, and asks the client to surface approvals for edits and commands.

To try the published preview in Buzz, install it and locate the binary:

```bash
npm install --global janet-agent@next
command -v janet
```

Then add a custom ACP harness in Buzz with these values:

| Field | Value |
| --- | --- |
| ID | `janet` |
| Label | `Janet` |
| Command | the absolute path printed by `command -v janet` |
| Arguments | `acp` |

Use an absolute command because a macOS app may not inherit the same `PATH` as your shell. To use a
non-default bundle or model, set the arguments to `acp --bundle docs/knowledge` or
`acp --model provider/model`. Janet must already have a selected model or receive one through that
flag or `JANET_MODEL`.

The first ACP preview accepts text prompts, streams text and tool status, supports cancellation,
and maps Janet's approval and question flows into ACP. Client-provided MCP servers and additional
workspace roots are not bridged yet; Janet reports that limitation on stderr and remains scoped to
the session project. stdout is reserved exclusively for ACP protocol messages.

Buzz currently exposes tool approvals in Janet's Activity panel rather than as channel controls.
When Janet needs a question answered or an approval reviewed, she also posts a notice into the
originating Buzz thread. Reply to a question in that thread; open Activity to approve or reject a
tool request.

Buzz's ACP cwd is its managed nest rather than an individual Git checkout. Janet therefore requires
a target under `REPOS/<project>/` before writing a bundle. For a new project, she asks you to create
or open it in Buzz first, verifies the checkout, and then defaults the bundle to
`REPOS/<project>/knowledge/`; she does not place bundles at the nest root.

### Herdr

Janet includes zero-configuration lifecycle reporting for
[Herdr](https://github.com/herdrdev/herdr), the runtime for coding agents. Start Janet normally in a
Herdr pane:

```bash
janet
```

When Herdr supplies a pane ID, Janet reports `idle`, `working`, and `blocked` as turns progress. It
also reports the active Janet thread ID and project path, making the session visible to Herdr and
available to resume with `janet --thread <id>`. No hook file or Janet-specific Herdr configuration
is required. Reporting is best-effort and becomes a no-op outside Herdr, so it never affects a turn
when Herdr is absent.

Repository documentation is conversational in this first test pass. Start Janet in the repository
and ask:

```text
Document this repository's architecture and developer workflows.
```

Janet reads source, tests, configuration, and approved read-only Git evidence in place. Writes
inside the selected knowledge bundle proceed without interruption; a write anywhere else in the
selected project requires your approval.

Use `-C <directory>` to select a project and `--bundle <path>` to select a bundle inside it. The
bundle path may be relative to the selected project or an absolute path within it:

```bash
janet --bundle docs/project-kb init
janet -C /path/to/project --bundle docs/project-kb query "what do we know?"
```

Janet rejects bundle paths outside the selected project.

Add `-p` (or pipe/redirect output) for headless one-shot mode. Headless query and ordinary lint
runs are read-only. Init, ingest, visualize, and `lint --fix` may edit the selected bundle. A
headless write outside that bundle is declined because there is no interactive approval prompt.
Shell commands and Git commits require explicit `--allow-exec`.

`janet lint` always starts with the deterministic, token-free OKF checker shipped in the package.
With no model configured it stops after that check, making it useful as a CI gate:

```bash
janet -C ./my-project lint
```

For every command, exit status is `0` for success, `1` for a task or conformance failure, and `2`
for invalid usage, configuration, or another operational failure.

## Interactive commands

| Command | Purpose |
| --- | --- |
| `/models` · `/model [id]` | Choose or switch the model |
| `/providers` | Show detected providers and their configuration variables |
| `/login [anthropic\|openai-codex] [browser\|device]` | Choose and sign in to a supported subscription |
| `/logout` · `/auth` | Manage authentication |
| `/observability` · `/traces` | Configure opt-in tracing and inspect local history |
| `/compact` | Compact the current conversation into observations |
| `/clear` | Start a new thread without deleting the old one |
| `/cancel` | Stop the active turn |
| `/help` · `/quit` | Show help or exit |

Esc or Ctrl+C cancels an active turn. Press Ctrl+C twice to exit.

## Models and authentication

Janet has no default provider. It discovers configured providers through Mastra's model router.
The initial provider cohort includes OpenAI, Anthropic, Google AI Studio, DeepSeek, Groq, Mistral,
xAI, OpenRouter, Together AI, Fireworks AI, and Cerebras.

Vertex AI and Amazon Bedrock use dedicated cloud gateways. OpenAI and Anthropic also support
ChatGPT/Codex and Claude Max subscription OAuth. An explicitly exported API key takes precedence
over stored OAuth for that process.

Credentials, settings, threads, caches, and local traces use
`~/.janet/`. Project-local state lives under
`<project>/.janet/`. On first beta.3 launch, Janet moves the old global
`~/.agent-knowledge/` directory only when `~/.janet/` does not already exist.
Inside a Git repository, Janet adds its project-local runtime directory to Git's private
`info/exclude` file when necessary; it does not edit the repository's tracked `.gitignore`.

## Memory

Janet uses Mastra Observational Memory by default. The Observer compresses older messages and
noisy tool output into durable observations; the Reflector condenses those observations over
longer sessions. Raw messages remain in local storage and can still be recalled.

Memory work stays on the provider you authenticated. Override the automatic choice with
`JANET_MEMORY_MODEL`, or set `JANET_OBSERVER_MODEL` and `JANET_REFLECTOR_MODEL` separately.

## Observability

Tracing is strictly off by default. `/observability` can enable metadata-only or full capture to
local history, Phoenix, or another OTLP-compatible backend. Secrets come from the environment and
are never written to Janet settings.

See [OBSERVABILITY.md](./OBSERVABILITY.md) for the architecture, privacy model, configuration, and
eval roadmap.

## Local document tools

Janet reads PDFs through a dedicated TypeScript extractor. Small documents return page-delimited
text; larger documents use cached Markdown artifacts read in bounded chunks. Raw PDF bytes never
enter model history.

The public web reader validates every redirect, blocks private and metadata networks, does not
execute page JavaScript, and returns readable Markdown through the same bounded artifact pattern.
It needs no API key.

## Agent Knowledge skills

Janet is built around the seven portable
[Agent Knowledge](https://github.com/stjbrown/agent-knowledge) skills:

- `kb`
- `kb-init`
- `kb-ingest`
- `kb-document`
- `kb-query`
- `kb-lint`
- `kb-visualize`

Agent Knowledge owns their source, deterministic conformance checker, and graph generator. Janet
pins `@stjbrown/agent-knowledge-skills@0.3.2` at build time and copies those skills into its own
package, so an installed Janet remains self-contained and works offline.

You can also install the skills directly into another compatible agent without installing Janet:

```bash
npx skills@latest add stjbrown/agent-knowledge
```

## Development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm verify
pnpm pack:janet
```

`sync:skills` runs before build, test, and pack. It resolves the installed skills package, verifies
the exact version and all seven skill directories, then regenerates the ignored root `skills/`
folder.

See [TESTING.md](./TESTING.md) for the prerelease test matrix.

## License

[MIT](./LICENSE). Portions of Janet are adapted from MastraCode under Apache-2.0. The bundled Agent
Knowledge material includes the OKF specification under Apache-2.0 and the `yaml` parser under ISC.
See [NOTICE](./NOTICE).
