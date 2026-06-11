# Lane 2 Checkpoint: Codex App-Server Adapter Scaffold

Date: 2026-06-11
Branch: `codex/codex-app-server-runtime`

## Files Changed

- `packages/agent-runtime/src/codex-app-server-adapter.ts`
- `packages/agent-runtime/src/codex-app-server-adapter.test.ts`
- `packages/agent-runtime/src/index.ts`

## What Changed

- Added `CodexAppServerRuntimeAdapter`.
- Added start, resume, fork, prompt, and dispose adapter methods.
- Added `CodexAppServerRuntimeSession` with OpenStrat session id, runtime session id, Codex thread id, transcript ref, enabled tools, and disabled native tools.
- Added `FakeCodexAppServerRuntimeAdapter` for tests without launching a native Codex app-server process.
- Fake runtime validates that manifests use `codex_app_server`.
- Fake runtime can resume from an explicit Codex thread id and fork side sessions from a parent Codex thread.
- Exported the adapter module from `@openstrat/agent-runtime`.

## Commands Run

- `pnpm test packages/agent-runtime/src/codex-app-server-adapter.test.ts`
- `pnpm --filter @openstrat/agent-runtime typecheck`

## Pass/Fail Status

- New Codex app-server adapter tests: passed, 3 tests.
- Agent runtime package typecheck: passed.

## Remaining Issues

- The adapter does not yet write event log projections.
- The adapter does not yet persist OpenStrat-to-Codex thread bindings.
- Dynamic tool calls are not yet bridged through `AgentToolGateway`.

## Next Lane Unlocked

Lane 3: Session binding and transcript projection. The adapter now has a fake runtime boundary that can carry Codex thread ids and transcript refs, so the next lane can persist bindings and project Codex runtime events into OpenStrat-owned state.
