# Lane 6 Checkpoint: Risk and Deployment Gates

Date: 2026-06-10
Branch: `goal/06-16-2026-e2e-scaffolding`

## Files Changed

- `packages/cli/package.json`
- `packages/cli/tsconfig.json`
- `packages/cli/src/commands.ts`
- `packages/cli/src/commands.test.ts`
- `pnpm-lock.yaml`

## What Changed

- Added `openstrat gate create-sample`.
- Added `openstrat gate inspect`.
- Added guarded `openstrat deploy plan --gate-ref <GATE_REF>`.
- Gate artifacts preserve the strategy ref, backtest report ref, risk policy ref, and deployment gate ref.
- Gate inspection reuses the agent gateway `deployment_gate.inspect` path so CLI readiness matches the harness tool rules.
- Not-ready gates report concrete missing requirements:
  - `fee-inclusive backtest required`
  - `slippage-model backtest required`
  - `risk review required`
  - `deployment kill switch is active`
- Deployment planning exits nonzero when the gate is not ready.
- CLI package metadata now declares the workspace packages it imports directly.

## Commands Run

- `pnpm test packages/cli/src/commands.test.ts`
- `pnpm typecheck`
- `pnpm format:check`
- `pnpm build`
- `pnpm lint`
- `./packages/cli/dist/openstrat market ingest-fixture --symbol BTC --interval 15m` with temp `HOME`
- `./packages/cli/dist/openstrat backtest run-sample --strategy-ref sample_moving_average_breakout --dataset-ref <dataset-ref> --fee-bps 5 --slippage-bps 10` with temp `HOME`
- `./packages/cli/dist/openstrat gate create-sample --strategy-ref sample_moving_average_breakout --backtest-report-ref <report-ref> --risk-policy-ref risk/sample --ready` with temp `HOME`
- `./packages/cli/dist/openstrat gate inspect <gate-ref>` with temp `HOME`
- `./packages/cli/dist/openstrat deploy plan --gate-ref <ready-gate-ref>` with temp `HOME`
- `./packages/cli/dist/openstrat gate create-sample --strategy-ref sample_moving_average_breakout --backtest-report-ref <report-ref> --risk-policy-ref risk/sample --not-ready` with temp `HOME`
- `./packages/cli/dist/openstrat deploy plan --gate-ref <not-ready-gate-ref>` with temp `HOME`, expected rejection verified

## Pass/Fail Status

- New gate CLI test: passed.
- Full CLI command test file: passed, 8 tests.
- Workspace typecheck: passed across all workspace packages.
- Format check: passed.
- Build: passed.
- Lint: passed.
- Linked CLI smoke: passed.
- Not-ready deployment planning rejection: passed.

## Remaining Issues

- Gate thresholds are materialized but not yet evaluated against backtest metrics beyond the current gateway readiness requirements.
- Deployment planning is still a local terminal plan stub. Provider-specific deployment is intentionally left for the deployment lane.

## Next Lane Unlocked

Lane 7: Agent memory and decision ledger. Strategy, dataset, backtest, and gate refs now exist as durable artifacts, so the next lane can attach agent decisions and memory proposals to a coherent evidence trail.
