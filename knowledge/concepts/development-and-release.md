---
type: Development Practice
title: Janet development, testing, and release
generated:
  at: 2026-08-04T12:38:00Z
  by: janet-agent/0.3.2
sources:
  - id: package
    resource: ../../package.json#scripts
    title: Development scripts
  - id: testing
    resource: ../../TESTING.md
    title: Release and beta test plan
  - id: ci
    resource: ../../.github/workflows/ci.yml
    title: Continuous integration
  - id: tests
    resource: ../../test
    title: Automated test suite
---
# Janet development, testing, and release

The package uses pnpm 11.13.1, Node.js 22.13+, TypeScript, tsup, and Vitest. `pnpm build` synchronizes skills and bundles the CLI; `pnpm typecheck` runs TypeScript without emit; `pnpm test` synchronizes skills and runs Vitest; `pnpm verify` runs all three; `pnpm pack:janet` verifies and packages the release.[^package]

CI runs on macOS, installs with the frozen lockfile, runs `pnpm verify`, then checks the packed tarball for the binary, seven skills, lint checker, license files, platform metadata, and a clean-install smoke test. The package intentionally publishes only macOS support.[^ci][^package]

The release test plan covers clean installation, authentication and model persistence, project instructions, init/ingest/query/lint/viz, repository-documentation write boundaries, approvals, shell fail-closed behavior, cancellation, observability, ACP/Buzz, and project isolation. Deterministic lint must work without a model and uses exit 0 for conformant, 1 for nonconformant, and 2 for operational failure.[^testing]

The automated suite is organized by subsystem, including ACP, commands, memory, providers, permissions, workspace guards and approvals, web/PDF tools, observability, TUI, and package metadata. Contributors should preserve source and test evidence and add focused tests for behavior changes.[^tests]

## Related concepts

- [System architecture](system-architecture.md)
- [Command lifecycle](command-lifecycle.md)
- [Safety and permissions](safety-and-permissions.md)
- [Observability](observability.md)

## Repository evidence

- [`package.json`](../../package.json#scripts) defines the development and release scripts.[^package]
- [`TESTING.md`](../../TESTING.md) defines release gates, runtime matrix, lifecycle, and exit contracts.[^testing]
- [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) defines CI and packaging smoke tests.[^ci]
- [`test/`](../../test) contains subsystem tests.[^tests]

[^package]: package.json
[^testing]: TESTING.md
[^ci]: .github/workflows/ci.yml
[^tests]: test
