# Lane 5 Checkpoint: CLI JSON Output

Date: 2026-06-14
Branch: `codex/goal-01-harness-contract-hardening`

## Files Changed

- `packages/cli/src/commands.ts`
- `packages/cli/src/commands.test.ts`
- `checkpoints/goal-01-harness-contract-hardening-lane-5-cli-json-output.md`

## What Changed

- Added a global `--json` flag to `runOpenStratCli`.
- JSON mode removes `--json` before command dispatch, so subcommands do not need to know about the flag.
- Human-mode output is preserved for existing commands.
- JSON mode suppresses intermediate human stdout/stderr and emits a single machine-readable stdout line.
- JSON success output uses `AgentResultEnvelopeSchema` with:
  - `status: "completed"`
  - `side_effect: "none"`
  - `data.command`
  - `data.output_lines`
- JSON CLI contract errors use blocked envelopes:
  - unknown command
  - usage errors
  - missing required flags
  - prompt/readiness argument contract failures
- JSON runtime/state failures use failed envelopes.

## TDD Evidence

- Red tests were added first for:
  - completed `doctor --json`
  - blocked unknown command with `--json`
  - failed missing market dataset with `--json`
- Initial focused run failed because `--json` was ignored and human stdout/stderr were emitted.
- Implementation added shared top-level output finalizers and reused `AgentResultEnvelopeSchema`.
- Focused green run passed:
  - `pnpm test packages/cli/src/commands.test.ts`
  - 1 test file passed, 15 tests passed.

## Commands Run

- `pnpm test packages/cli/src/commands.test.ts`
- `pnpm exec prettier --write packages/cli/src/commands.ts packages/cli/src/commands.test.ts`
- `pnpm --filter openstrat typecheck`
- `pnpm --filter openstrat build`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm build`
- `git diff --check`

## Pass/Fail Status

- Focused red tests failed for the expected inert-`--json` reasons.
- Focused green tests passed: 15 tests.
- CLI package typecheck passed.
- CLI package build passed.
- Full test suite passed: 20 test files, 98 tests.
- Workspace typecheck passed.
- Lint passed.
- Format check passed.
- Build passed.
- Whitespace diff check passed.

## Remaining Issues

- JSON success data currently includes the captured human output lines rather than command-specific typed payloads.
- Commands that already print pretty JSON in human mode are nested as output lines in `--json` mode.
- Future lanes can promote high-value commands to explicit typed JSON data without breaking the envelope contract.

## Next Lane Unlocked

Lane 6: Goal artifacts. CLI command outcomes now have a stable result-envelope surface that future goal runs and orchestration code can parse without scraping human output or stderr text.
