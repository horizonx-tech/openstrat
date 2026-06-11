# Lane 1 Checkpoint: Runtime Contract Split

Date: 2026-06-11
Branch: `codex/codex-app-server-runtime`

## Files Changed

- `packages/domain/src/agent.ts`
- `packages/domain/src/agent-contracts.test.ts`
- `packages/agent-runtime/src/model-routing.ts`
- `packages/agent-runtime/src/model-routing.test.ts`

## What Changed

- Tightened `AgentRuntimeConfigSchema` into a discriminated runtime contract.
- `codex_app_server` runtime configs now require `provider: "openai-codex"` and a model profile id.
- Existing `pi`, `openclaw_compat`, and `fake` runtime kinds remain available.
- Added explicit `runtime_kind` to OpenStrat model profiles.
- Codex app-server profiles require OpenAI Codex OAuth.
- OpenAI Codex OAuth is rejected for generic/BYOK runtime profiles.
- Future OpenRouter profiles are represented as BYOK profiles on the generic `pi` runtime path, without implementing OpenRouter behavior in this lane.

## Commands Run

- `pnpm test packages/domain/src/agent-contracts.test.ts`
- `pnpm test packages/agent-runtime/src/model-routing.test.ts`
- `pnpm test packages/agent-runtime/src/pi-adapter.test.ts`

## Pass/Fail Status

- Domain runtime contract test: passed.
- Model routing contract test: passed.
- Existing Pi adapter test: passed.

## Remaining Issues

- No Codex app-server adapter exists yet.
- Runtime manifests can distinguish `codex_app_server`, but no implementation uses it.
- OpenRouter remains a contract boundary only.

## Next Lane Unlocked

Lane 2: Codex app-server adapter scaffold. Runtime and model-profile ownership are now explicit enough to add a fake/testable adapter without conflating Codex OAuth with BYOK provider keys.
