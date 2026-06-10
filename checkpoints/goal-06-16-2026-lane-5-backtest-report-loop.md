# Lane 5 Checkpoint: Backtest Request to Report

Date: 2026-06-10
Branch: `goal/06-16-2026-e2e-scaffolding`

## Files Changed

- `packages/cli/package.json`
- `packages/cli/tsconfig.json`
- `packages/cli/src/commands.ts`
- `packages/cli/src/commands.test.ts`

## What Changed

- Added `openstrat backtest run-sample`.
- The command requires `--strategy-ref`, `--dataset-ref`, `--fee-bps`, and `--slippage-bps`.
- The command reads the dataset manifest written by Lane 3.
- The command runs `runCandleBacktest` using the sample moving-average breakout strategy.
- The command writes a backtest report artifact and uses the backtester-written trade ledger artifact.

## Commands Run

- `pnpm test packages/cli/src/commands.test.ts -t "runs a sample candle backtest"`
- `pnpm test packages/cli/src/commands.test.ts`
- `pnpm typecheck`
- `pnpm build`
- `openstrat market ingest-fixture --symbol BTC --interval 15m` with temp `HOME`
- `openstrat backtest run-sample --strategy-ref sample_moving_average_breakout --dataset-ref <dataset-ref> --fee-bps 5 --slippage-bps 10` with temp `HOME`

## Pass/Fail Status

- New backtest CLI test: passed.
- Full CLI command test file: passed, 7 tests.
- Workspace typecheck: passed across all workspace packages.
- Build: passed.
- Linked CLI backtest smoke: passed.

## Remaining Issues

- The sample fixture has two candles, so the sample strategy produces zero trades. The report and ledger paths are still exercised.
- Arbitrary strategy refs and user-provided slippage models remain out of scope for this lane.

## Next Lane Unlocked

Lane 6: Risk and deployment gates. Backtest reports and trade ledger refs now exist, so the next lane can create and inspect deployment gates from strategy, backtest, and risk refs.
