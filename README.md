# Janet

Janet is a local knowledge agent for building and maintaining portable project wikis in plain
Markdown using the Open Knowledge Format (OKF).

She operates on the current directory: run Janet in a project and its bundle lives at
`knowledge/`, while conversation history stays scoped to that project. The knowledge remains open,
diffable, and usable without Janet.

> Janet is prerelease software. The current npm release is `0.1.0-beta.1` under the `next` tag.

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

The package provides both `janet` and `ding` because you summon Janet with a ding.

Node.js 22.13 or newer is required.

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

Use `-C <directory>` to select a project and `--bundle <path>` to select a bundle inside it.
Janet rejects bundle paths outside the selected project.

Add `-p` (or pipe/redirect output) for headless one-shot mode. Headless query and ordinary lint
runs are read-only. Init, ingest, visualize, and `lint --fix` may edit the workspace. Shell
commands and Git commits require explicit `--allow-exec`.

`janet lint` always starts with the deterministic, token-free OKF checker shipped in the package.
With no model configured it stops after that check, making it useful as a CI gate:

```bash
janet -C ./my-project lint
```

Exit status is `0` for conformant, `1` for nonconformant, and `2` for an operational failure.

## Interactive commands

| Command | Purpose |
| --- | --- |
| `/models` · `/model [id]` | Choose or switch the model |
| `/providers` | Show detected providers and their configuration variables |
| `/login <anthropic\|openai-codex> [browser\|device]` | Sign in with a supported subscription |
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

Credentials, settings, threads, caches, and local traces retain the existing
`~/.agent-knowledge/` storage layout. Project-local state remains under
`<project>/.agent-knowledge/`.

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

Janet is built around the six portable
[Agent Knowledge](https://github.com/stjbrown/agent-knowledge) skills:

- `kb`
- `kb-init`
- `kb-ingest`
- `kb-query`
- `kb-lint`
- `kb-visualize`

Agent Knowledge owns their source, deterministic conformance checker, and graph generator. Janet
pins `@stjbrown/agent-knowledge-skills@0.1.0` at build time and copies those skills into its own
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
the exact version and all six skill directories, then regenerates the ignored root `skills/`
folder.

See [TESTING.md](./TESTING.md) for the prerelease test matrix.

## License

[MIT](./LICENSE). Portions of Janet are adapted from MastraCode under Apache-2.0. The bundled Agent
Knowledge material includes the OKF specification under Apache-2.0 and the `yaml` parser under ISC.
See [NOTICE](./NOTICE).
