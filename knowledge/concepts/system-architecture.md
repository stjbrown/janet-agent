---
type: System Architecture
title: Janet system architecture
generated:
  at: 2026-08-04T12:38:00Z
  by: janet-agent/0.3.2
sources:
  - id: readme
    resource: ../../README.md
    title: Product and operating model
  - id: controller
    resource: ../../src/agent/controller.ts#bootJanet
    title: Agent controller boot
  - id: package
    resource: ../../package.json
    title: Runtime and package boundaries
  - id: main
    resource: ../../src/main.ts#main
    title: CLI entry point
---
# Janet system architecture

Janet is a local CLI agent built on Mastra. It operates on one selected project and a bundle path inside that project, defaulting to `knowledge/`; conversation state is project-scoped while the Markdown bundle remains portable and diffable.[^readme]

The process entry point parses CLI arguments, resolves model and project/bundle paths, routes ACP before ordinary path resolution, starts the TUI for an interactive TTY, and delegates subcommands to headless execution. `lint` performs a deterministic conformance pass before any model-backed drift audit.[^main]

Controller boot creates one per-process session, loads the project-root `JANET.md`, creates observability, links portable skills under `.janet/skills`, constructs one shared workspace, creates the agent, and installs permission rules. Mastra supplies agent control, model routing, memory, and observability; Janet supplies project scoping, OKF workflows, safety policy, and terminal/ACP surfaces.[^controller]

The package targets Node.js 22.13+ and macOS (`darwin`) only. Build output exposes the `janet` binary at `dist/main.js`; skills are synchronized into the package during build and tests.[^package]

## Related concepts

- [Command lifecycle](command-lifecycle.md)
- [Safety and permissions](safety-and-permissions.md)
- [Observability](observability.md)

## Repository evidence

- [`README.md`](../../README.md) establishes Janet’s purpose, project and bundle scoping, and Mastra foundation.[^readme]
- [`src/main.ts`](../../src/main.ts) establishes command routing, ACP precedence, TUI/headless branching, and lint sequencing.[^main]
- [`src/agent/controller.ts`](../../src/agent/controller.ts#bootJanet) establishes session boot composition and shared workspace construction.[^controller]
- [`package.json`](../../package.json) establishes supported Node/macOS platform, entrypoint, scripts, and dependencies.[^package]

[^readme]: README.md
[^main]: src/main.ts
[^controller]: src/agent/controller.ts
[^package]: package.json
