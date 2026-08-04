---
type: Workflow
title: Janet command and session lifecycle
generated:
  at: 2026-08-04T12:38:00Z
  by: janet-agent/0.3.2
sources:
  - id: main
    resource: ../../src/main.ts#main
    title: CLI lifecycle
  - id: readme
    resource: ../../README.md#Use
    title: User-facing commands
  - id: testing
    resource: ../../TESTING.md#Complete lifecycle
    title: End-to-end lifecycle checks
---
# Janet command and session lifecycle

The CLI supports interactive chat plus `init`, `ingest`, `query`, `lint`, `viz`, and ACP modes. `-C/--dir` selects a project, `--bundle` selects an in-project bundle, `--model` or `JANET_MODEL` selects a model, and `--thread` resumes a thread.[^main]

Argument errors exit with status 2. Ordinary interactive invocation starts the TUI only when stdout is a TTY; otherwise a missing subcommand is rejected. ACP is a long-running stdio transport whose client-provided session directory is authoritative. Headless commands build a directive and run with capabilities appropriate to the operation.[^main]

The knowledge workflow is intended to compound: initialize a bundle, ingest sources, query with citations, lint conformance and drift, and visualize connections. Repository documentation is a conversational workflow that reads source, tests, configuration, and approved read-only Git evidence while writing only the selected bundle.[^readme]

Testing defines the complete lifecycle as init, ingest, cited query, lint, visualization, restart, and preservation of source files. It also requires refreshes to edit knowledge only when relevant repository behavior changes.[^testing]

## Related concepts

- [System architecture](system-architecture.md)
- [Safety and permissions](safety-and-permissions.md)
- [Development and release](development-and-release.md)

## Repository evidence

- [`src/main.ts`](../../src/main.ts#main) establishes parsing, dispatch, exit codes, ACP, TUI, headless, and lint behavior.[^main]
- [`README.md`](../../README.md#Use) lists supported knowledge commands and project selection.[^readme]
- [`TESTING.md`](../../TESTING.md#Complete%20lifecycle) defines the expected end-to-end workflow.[^testing]

[^main]: src/main.ts
[^readme]: README.md
[^testing]: TESTING.md
