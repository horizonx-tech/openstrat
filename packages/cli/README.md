# OpenStrat CLI

Status: functional Codex SDK workbench scaffold.

## User Flow

From an OpenStrat project directory:

```bash
openstrat
```

Bare `openstrat` opens the workbench TUI. Natural language goes to Codex SDK. OpenStrat slash commands are deterministic product commands around the session:

- `/status`
- `/markets`
- `/datasets`
- `/strategy`
- `/backtest`
- `/risk`
- `/artifacts`
- `/sessions`
- `/new`
- `/resume <session-id>`
- `/compact`

Codex owns model execution, native file edits, shell commands, sandboxing, approvals, and thread IDs. OpenStrat stores project-side sessions, transcripts, summaries, and artifact indexes under project `.openstrat`.

## Auth And Homes

Use isolated homes for repeatable development:

```bash
export CODEX_HOME=/tmp/openstrat-codex-home
export OPENSTRAT_USER_HOME=/tmp/openstrat-user-home
export OPENSTRAT_HOME="$PWD/.openstrat"
openstrat auth codex
openstrat doctor
```

`openstrat auth codex` delegates to Codex login using the configured `CODEX_HOME`. OpenStrat treats Codex auth as opaque. It checks whether auth exists, but does not read or print token contents.

Project `.openstrat` is for OpenStrat state only: sessions, transcripts, summaries, artifact indexes, and project-local config. User-scoped OpenStrat preferences belong under `OPENSTRAT_USER_HOME`. Codex credentials belong under `CODEX_HOME` or the OS credential store.

## Headless Smoke

For deterministic local tests without live Codex:

```bash
OPENSTRAT_CODEX_RUNTIME=fake openstrat chat --prompt "write a strategy"
printf '/status\nwrite a strategy\n/artifacts\n/exit\n' | OPENSTRAT_CODEX_RUNTIME=fake openstrat
```

For live Codex, omit `OPENSTRAT_CODEX_RUNTIME=fake` after `openstrat auth codex` succeeds.

## Codex Tool Bridge

The CLI configures a local OpenStrat MCP stdio bridge for Codex SDK turns. The MCP bridge exposes canonical OpenStrat tool names with MCP-safe underscores. Current tools route through the OpenStrat gateway. Proposal-capture and deployment-gate inspection tools can execute against project `.openstrat` storage; market and risk tools return clear failures until project data/risk dependencies are wired:

- `market_data_read_snapshot`
- `backtest_request`
- `risk_validate_intent`
- `strategy_patch_capture`
- `memory_proposal_capture`
- `deployment_gate_inspect`

## Current Gaps

- `/markets`, `/datasets`, `/backtest`, and `/risk` are functional command surfaces but not yet wired to project dataset/backtest/risk stores.
- The MCP bridge is visible to Codex, but domain tool execution still needs real dependencies instead of unavailable placeholders.
- Rich terminal rendering, menus, keyboard shortcuts, and status panes are not implemented yet.
- Wallet signing, live trading, cloud deployment, and strategy quality tuning are intentionally out of scope for this slice.
