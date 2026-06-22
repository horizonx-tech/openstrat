# Codex SDK TUI Workbench Goal Report

Status: completed locally, uncommitted.

## Summary

OpenStrat now has a functional `openstrat` CLI package centered on Codex SDK rather than Pi or OpenClaw. Bare `openstrat` launches a line-oriented workbench TUI; natural-language turns route to Codex SDK; deterministic slash commands project OpenStrat state; sessions, transcripts, summaries, and artifact indexes persist under project `.openstrat`.

Codex remains the harness layer. It owns model execution, native file edits, shell commands, sandboxing, approval policy, auth, and thread ids. OpenStrat owns trading-specific product state, config boundaries, slash-command surfaces, artifact projection, and the MCP gateway that exposes OpenStrat tool contracts to Codex.

## Implemented

- Added `@openstrat/cli` with the `openstrat` bin.
- Added isolated home resolution for project `.openstrat`, `OPENSTRAT_USER_HOME`, and `CODEX_HOME`.
- Added `openstrat auth codex`, `openstrat auth status`, `openstrat doctor`, `openstrat sessions`, and `openstrat chat --prompt`.
- Added bare TUI command loop with `/status`, `/markets`, `/datasets`, `/strategy`, `/backtest`, `/risk`, `/artifacts`, `/sessions`, `/new`, `/resume`, `/compact`, and `/deploy`.
- Added Codex SDK runtime using `@openai/codex-sdk` with `workspace-write` sandbox and `on-request` approvals.
- Added deterministic `OPENSTRAT_CODEX_RUNTIME=fake` mode for CI and local tests.
- Added OpenStrat session store, transcript JSONL, summary artifacts, and artifact index projection for Codex messages, command executions, file changes, slash commands, and failures.
- Added Codex baseline contract documentation in `packages/domain/CODEX_BASELINE.md`.
- Added a local MCP stdio bridge exposing OpenStrat gateway tools with MCP-safe names.
- Added gateway-backed MCP invocation for proposal capture, deployment gate inspection, market data lookup, and risk validation. Market/risk currently use unavailable dependencies and fail clearly until project stores are wired.
- Bundled internal OpenStrat workspace packages into the CLI build so disposable temp installs do not try to fetch private unpublished `@openstrat/*` packages.

## Live Smoke

Live disposable harness root used for verification:

`/private/tmp/openstrat-codex-sdk-live.gndsG0`

The harness isolated:

- `CODEX_HOME`
- `OPENSTRAT_USER_HOME`
- project `OPENSTRAT_HOME`
- temp npm prefix

Covered flow:

- `openstrat auth codex`
- `openstrat doctor`
- bare `openstrat` TUI
- `/status`
- `/new`
- natural-language Codex prompt that wrote `src/strategy.ts`
- `/artifacts`
- `/sessions`
- `/compact`
- `/resume <session-id>`

The live run persisted a real Codex thread id, wrote transcripts, recorded command/file-change artifacts, and created a summary artifact. Codex auth JSON was treated as opaque and was not printed.

Cleanup command for the disposable harness when no longer needed:

```bash
rm -rf /private/tmp/openstrat-codex-sdk-live.gndsG0
```

## Verification

Passing gates:

- `pnpm --filter @openstrat/cli typecheck`
- `pnpm test -- packages/cli/src/commands.test.ts packages/domain/src/codex-contracts.test.ts packages/workers/src/agent-tool-gateway.test.ts`
- `pnpm test`
- `pnpm build`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `git diff --check`
- live disposable harness smoke with real Codex auth

## What Is Still Missing

This goal restores the Codex SDK TUI baseline, but it does not complete the real strategy loop.

The next workbench prerequisite should wire:

- project-aware `/markets` and `/datasets` views over ingested data;
- a backtest runner reachable from slash commands and Codex tool calls;
- strategy code validation against OpenStrat strategy contracts;
- risk review against project data and policies;
- a loop contract that instructs Codex to continue through analysis, backtest setup, code writing, validation, risk review, and evidence artifacts in one run unless blocked.

## Final Answer

Wallet provisioning and approval behavior should not be the next goal yet. The next goal should complete the real strategy workbench loop on top of this Codex SDK TUI baseline. Once OpenStrat can ingest data, have Codex reason over it, write strategy code, validate it, run a backtest, and produce risk evidence without wallet or cloud deployment, wallet provisioning becomes a meaningful next layer instead of a distraction from core workflow readiness.
