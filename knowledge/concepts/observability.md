---
type: Operations
title: Janet observability and cancellation
generated:
  at: 2026-08-04T12:38:00Z
  by: janet-agent/0.3.2
sources:
  - id: observability
    resource: ../../OBSERVABILITY.md
    title: Observability design
  - id: tests
    resource: ../../test/observability-runtime.test.ts
    title: Observability runtime tests
  - id: controller
    resource: ../../src/agent/controller.ts#bootJanet
    title: Runtime initialization
---
# Janet observability and cancellation

Tracing is off by default. When enabled, Janet can capture metadata or full content, store local traces in a separate `~/.janet/observability.db`, or export standard OTLP to Phoenix or another compatible backend. Secrets come from environment variables and are not written to settings.[^observability]

Metadata mode excludes prompts, responses, tool arguments, and results; full mode requires a second explicit TUI confirmation. Endpoint status redacts credentials, query parameters, and fragments. Trace export and pruning are best effort and must not turn a successful response into a failed one.[^observability]

The controller creates one observability runtime during boot. Thread history remains separate in `threads.db`. `/observability` configures capture, `/traces` inspects recent root traces without printing captured payloads, and environment variables override saved preferences for headless runs.[^observability][^controller]

Cancellation is global: Esc or the first Ctrl+C aborts an active turn, `/cancel` follows the same path, and a second Ctrl+C can force exit. Tests cover default-off behavior, privacy flags, local persistence, redaction, and cancellation.[^observability][^tests]

## Related concepts

- [System architecture](system-architecture.md)
- [Safety and permissions](safety-and-permissions.md)
- [Development and release](development-and-release.md)

## Repository evidence

- [`OBSERVABILITY.md`](../../OBSERVABILITY.md) establishes modes, destinations, privacy, configuration, and cancellation.[^observability]
- [`src/agent/controller.ts`](../../src/agent/controller.ts#bootJanet) establishes runtime creation during controller boot.[^controller]
- [`test/observability-runtime.test.ts`](../../test/observability-runtime.test.ts) establishes automated runtime coverage.[^tests]

[^observability]: OBSERVABILITY.md
[^controller]: src/agent/controller.ts
[^tests]: test/observability-runtime.test.ts
