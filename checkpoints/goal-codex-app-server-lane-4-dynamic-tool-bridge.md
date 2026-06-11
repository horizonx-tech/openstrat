# Lane 4 Checkpoint: Codex Dynamic Tool Bridge

Date: 2026-06-11
Branch: `codex/codex-app-server-runtime`

## Files Changed

- `packages/agent-runtime/src/codex-app-server-adapter.ts`
- `packages/agent-runtime/src/codex-app-server-adapter.test.ts`

## What Changed

- Added `CodexAppServerRuntimeEvent` fixtures for fake app-server message, turn, and tool-call events.
- Added `toolGateway` support to the Codex app-server adapter dependency boundary.
- Codex tool requests now project `agent.runtime.tool_call_requested` events.
- Enabled Codex tool requests are routed through `AgentToolGateway.invoke`.
- Successful gateway calls project `agent.runtime.tool_call_completed` with result refs when available.
- Disabled Codex-native tools such as `shell` are blocked before gateway invocation.
- Unenabled or unavailable harness tools fail closed with `agent.runtime.tool_call_blocked`.

## Commands Run

- `pnpm test packages/agent-runtime/src/codex-app-server-adapter.test.ts`
- `pnpm --filter @openstrat/agent-runtime typecheck`
- `pnpm format:check`
- `git diff --check`

## Pass/Fail Status

- New Codex app-server adapter tests: passed, 7 tests.
- Agent runtime package typecheck: passed.
- Repository format check: passed.
- Whitespace diff check: passed.

## Remaining Issues

- CLI commands do not yet select `codex_app_server` as the first-class runtime path.
- CLI tests do not yet exercise fake app-server session creation or final-only prompt behavior.
- Resume/recovery still needs a CLI-level flow over the persisted Codex bindings.

## Next Lane Unlocked

Lane 5: Codex-first CLI flow. The adapter now has session binding, event projection, transcript projection, and gateway-routed tool handling, so the next lane can expose Codex as the preferred runtime path from the command surface without bypassing OpenStrat-owned harness tools.
