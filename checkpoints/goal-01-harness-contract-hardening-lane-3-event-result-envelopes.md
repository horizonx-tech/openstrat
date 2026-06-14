# Lane 3 Checkpoint: Event And Result Envelopes

Date: 2026-06-14
Branch: `codex/goal-01-harness-contract-hardening`

## Files Changed

- `packages/domain/src/agent.ts`
- `packages/domain/src/agent-contracts.test.ts`
- `packages/workers/src/agent-tool-gateway.ts`
- `packages/workers/src/agent-tool-gateway.test.ts`
- `packages/agent-runtime/src/pi-adapter.ts`
- `packages/agent-runtime/src/pi-adapter.test.ts`
- `packages/agent-runtime/src/codex-app-server-adapter.ts`
- `packages/agent-runtime/src/codex-app-server-adapter.test.ts`
- `checkpoints/goal-01-harness-contract-hardening-lane-3-event-result-envelopes.md`

## What Changed

- Added `AgentRuntimeEventMetadataSchema` for consistent runtime event metadata:
  - `transcript_ref`
  - `runtime`
  - `runtime_session_id`
  - `codex_thread_id`
- Added `AgentResultEnvelopeSchema` for standard result states:
  - `completed`
  - `blocked`
  - `failed`
- Added `AgentToolLifecyclePayloadSchema` for structured tool lifecycle payloads with `tool_call_id`, `tool_name`, and optional `result`.
- Gateway audit events now include structured `result` envelopes while preserving existing top-level fields such as `result_ref`, `reason`, `error`, and `side_effect`.
- Pi runtime events now include runtime metadata and structured completed, blocked, or failed result envelopes for tool lifecycle events.
- Codex app-server runtime events now include runtime metadata and structured completed or blocked result envelopes for tool lifecycle events.
- Existing dotted event names were preserved for compatibility: `agent.runtime.*` and `agent.tool_call.*`.

## TDD Evidence

- Red tests were added first across:
  - domain contracts
  - agent tool gateway events
  - Pi runtime projection
  - Codex app-server runtime projection
- Initial focused run failed because the schemas did not exist and emitted payloads lacked `result` envelopes or runtime metadata.
- Implementation added domain schemas and projected envelopes through gateway, Pi, and Codex runtime adapters.
- Focused green run passed:
  - `pnpm test packages/domain/src/agent-contracts.test.ts packages/workers/src/agent-tool-gateway.test.ts packages/agent-runtime/src/pi-adapter.test.ts packages/agent-runtime/src/codex-app-server-adapter.test.ts`
  - 4 test files passed, 27 tests passed.

## Commands Run

- `pnpm test packages/domain/src/agent-contracts.test.ts packages/workers/src/agent-tool-gateway.test.ts packages/agent-runtime/src/pi-adapter.test.ts packages/agent-runtime/src/codex-app-server-adapter.test.ts`
- `pnpm --filter @openstrat/domain build`
- `pnpm exec prettier --write packages/domain/src/agent-contracts.test.ts packages/workers/src/agent-tool-gateway.test.ts packages/agent-runtime/src/pi-adapter.test.ts packages/agent-runtime/src/codex-app-server-adapter.test.ts packages/domain/src/agent.ts packages/workers/src/agent-tool-gateway.ts packages/agent-runtime/src/pi-adapter.ts packages/agent-runtime/src/codex-app-server-adapter.ts`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm build`
- `git diff --check`

## Pass/Fail Status

- Focused red tests failed for the expected missing-envelope reasons.
- Focused green tests passed: 27 tests.
- Full test suite passed: 19 test files, 93 tests.
- Workspace typecheck passed.
- Lint passed.
- Format check passed.
- Build passed.
- Whitespace diff check passed.

## Remaining Issues

- `AgentToolGateway.invoke` still only dispatches `market_data.read_snapshot`; the next lane should consolidate tool registry metadata before broadening generic dispatch.
- Session grants are still declared in the domain but not enforced by gateway invocation.
- CLI `--json` output is still not standardized. Lane 5 should reuse `AgentResultEnvelopeSchema` for command success, blocked, and error responses.

## Next Lane Unlocked

Lane 4: Tool schema and grants. Runtime and gateway events now expose structured result envelopes, so a registry can define tool inputs, outputs, side effects, and required grants without forcing downstream consumers to parse prose or event-name-specific payloads.
