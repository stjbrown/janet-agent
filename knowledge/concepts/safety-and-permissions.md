---
type: Safety Model
title: Janet safety and permissions
generated:
  at: 2026-08-04T12:38:00Z
  by: janet-agent/0.3.2
sources:
  - id: controller
    resource: ../../src/agent/controller.ts#permissionRulesFor
    title: Interactive and headless policies
  - id: permissions
    resource: ../../src/agent/permissions.ts#janetToolCategory
    title: Tool categories and overrides
  - id: readme
    resource: ../../README.md#Project%20instructions
    title: Instruction trust boundary
  - id: testing
    resource: ../../TESTING.md#Permissions%20and%20cancellation
    title: Permission acceptance checks
---
# Janet safety and permissions

Janet trusts only the exact project-root `JANET.md` as project customization. `AGENTS.md`, `CLAUDE.md`, source files, and fetched content remain data unless explicitly requested as documentation evidence. Project instructions cannot override safety rules, tool permissions, knowledge trust, bundle write boundaries, or active skills.[^readme]

Interactive policy allows reads and edits quietly, while execution, MCP, and other tools ask. Headless policy allows reads, denies edits unless explicitly enabled, denies execution unless explicitly enabled, and denies MCP and unknown categories. This makes unattended operation fail closed.[^controller]

Workspace writes, edits, deletes, and directory creation are path-sensitive: the controller preserves an approval decision for targets outside the selected bundle even while routine tools use Mastra compatibility mode. Shell execution is a separate approval category.[^controller][^permissions]

Project and bundle paths are resolved inside the selected project; Janet rejects bundle paths outside it. ACP uses the client session project and requires a repository target under Buzz’s managed `REPOS/<project>/` layout. Cancellation uses Esc, first Ctrl+C, or `/cancel`; a second Ctrl+C force-exits if abort does not complete.[^readme]

## Related concepts

- [System architecture](system-architecture.md)
- [Command lifecycle](command-lifecycle.md)
- [Observability](observability.md)

## Repository evidence

- [`src/agent/controller.ts`](../../src/agent/controller.ts#permissionRulesFor) defines interactive/headless policy and approval override behavior.[^controller]
- [`src/agent/permissions.ts`](../../src/agent/permissions.ts#janetToolCategory) classifies read, edit, execute, and always-allowed tools.[^permissions]
- [`README.md`](../../README.md#Project%20instructions) defines instruction custody and project isolation.[^readme]
- [`TESTING.md`](../../TESTING.md#Permissions%20and%20cancellation) defines acceptance checks for approvals and cancellation.[^testing]

[^controller]: src/agent/controller.ts
[^permissions]: src/agent/permissions.ts
[^readme]: README.md
[^testing]: TESTING.md
