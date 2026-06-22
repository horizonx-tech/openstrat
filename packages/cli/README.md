# OpenStrat CLI

Local link loop:

```bash
pnpm build
cd packages/cli
npm link
hash -r
openstrat --version
```

The linked `openstrat` command uses a generated shell wrapper that prefers the
Node executable beside the npm bin shim. This keeps linked installs on the
active npm prefix even when another `node` appears earlier on `PATH`.

First local smoke loop:

```bash
pnpm build
pnpm --filter openstrat pack --dry-run
npm pack ./packages/cli
npm i -g ./openstrat-*.tgz
mkdir -p /tmp/openstrat-smoke && cd /tmp/openstrat-smoke
openstrat init
openstrat doctor
openstrat auth codex
openstrat chat --prompt "Say hello from OpenStrat in one sentence."
openstrat artifacts
openstrat reset --purge
openstrat doctor
```

By default, `openstrat init` creates the active runtime home at
`<project>/.openstrat`. Objects, datasets, event logs, transcripts, Pi session
bindings, and project artifacts for that strategy workspace live there. Codex
auth is user-scoped under `~/.openstrat/auth/pi-auth.json`; it is not written
inside the strategy project. Set `OPENSTRAT_HOME` only when you intentionally
want to override the project-local home, such as in hermetic tests. Set
`OPENSTRAT_USER_HOME` only when you intentionally want to override the
user-scoped auth/config root.

Machine-readable output:

```bash
openstrat doctor --json
openstrat market snapshot BTC-PERP --json
```

`--json` is a global flag. It suppresses intermediate human stdout/stderr and
emits one JSON line with an `AgentResultEnvelope`:

- `completed` for successful commands
- `blocked` for CLI contract failures such as usage errors or unknown commands
- `failed` for runtime or project-state failures

Guarded live market-data smoke:

```bash
openstrat market ingest-live --symbol HYPE-PERP --interval 15m --lookback-minutes 60 --confirm-live --json
openstrat market snapshot HYPE-PERP --json
```

`ingest-live` is read-only, opt-in, and guarded by `--confirm-live`. It writes
local runtime artifacts under the active project `.openstrat` home; it is not
required for the fixture-backed test suite.

## Agent Runtime

`openstrat` opens the workbench, and `openstrat chat` defaults to the Pi runtime
with Codex OAuth as the default model/auth profile:

```bash
openstrat
openstrat chat --prompt "Research BTC funding context."
```

When `openstrat` is run in a real terminal with no prompt, OpenStrat creates a
Pi `AgentSessionRuntime` and hands control to Pi `InteractiveMode`. OpenStrat
registers its workbench extension into that runtime, so the chat TUI gets the
same model/auth/session machinery as the Pi coding-agent CLI plus OpenStrat
tools and slash-command metadata.

Deterministic slash commands are still available in the headless CLI surface for
tests, scripting, and non-TTY environments:

```bash
openstrat /markets
openstrat /datasets
openstrat /status
openstrat /sessions
openstrat /resume agent_session_123 "Continue this session."
openstrat /new "Start a fresh session."
openstrat /compact agent_session_123
```

OpenStrat extension-backed commands currently include `/markets`, `/datasets`,
`/status`, `/strategy`, `/backtest`, `/risk`, `/deploy`, and `/sessions`. Pi
owns the native TUI behavior for `/resume`, `/new`, and `/compact`; OpenStrat's
headless aliases mirror those actions against project-local session bindings.

Run the Codex login once before using the real Pi runtime:

```bash
openstrat auth codex
openstrat chat --prompt "Use my Codex account through the Pi agent loop."
```

The Pi path stores OpenStrat-owned runtime state under the active project
`.openstrat` home:

- `agent-runtime/pi-sessions/*.jsonl` stores Pi's persistent session files.
- `agent-runtime/pi-session-bindings/*.json` maps OpenStrat session ids to Pi
  session refs and transcript refs.
- `agent-runtime/sessions/*.jsonl` stores OpenStrat-projected runtime events.
- `state.sqlite` stores the append-only event log.

Resume a Pi-backed chat session with the OpenStrat session id printed by the
first run:

```bash
openstrat chat --resume agent_session_123 --prompt "Continue from the same thread."
openstrat chat --continue --prompt "Continue the most recent Pi session."
```

Manual real-auth smoke:

```bash
mkdir -p /tmp/openstrat-real-auth-smoke
cd /tmp/openstrat-real-auth-smoke
openstrat init
openstrat auth codex
openstrat chat --prompt "Confirm OpenStrat is using my Codex account through Pi."
openstrat chat --resume <printed-agent-session-id> --prompt "Continue this session."
openstrat reset --purge
```

The smoke writes project runtime artifacts under `/tmp/openstrat-real-auth-smoke/.openstrat`.
Codex auth remains user-scoped under `~/.openstrat/auth/pi-auth.json` so the
project cleanup does not delete account login state.

For repeated live-auth development without touching the normal home directory or
a real strategy project, run the CLI inside an isolated temp harness:

```bash
ROOT="$(mktemp -d /tmp/openstrat-live.XXXXXX)"
mkdir -p "$ROOT/project" "$ROOT/user" "$ROOT/prefix"

export OPENSTRAT_USER_HOME="$ROOT/user"
export OPENSTRAT_HOME="$ROOT/project/.openstrat"
export npm_config_prefix="$ROOT/prefix"
export PATH="$ROOT/prefix/bin:$PATH"

pnpm build
npm install -g "$PWD/packages/cli"
cd "$ROOT/project"

openstrat doctor
openstrat auth codex
openstrat chat --prompt "Reply with exactly: OpenStrat live auth OK"
openstrat
```

Inside the TUI, exercise natural-language prompts and extension-backed commands
such as `/sessions`. Pi owns native `/compact`, `/new`, and `/resume`, while
OpenStrat records lifecycle hooks, projected transcripts, session bindings, and
semantic summaries under the active project `.openstrat` home. TUI-created
OpenStrat bindings are marked with `source: "tui"` so `/sessions` can show them
after the TUI exits.

The fake Codex app-server adapter is retained only as an explicit test harness:

```bash
openstrat chat --runtime fake-codex-app-server --prompt "Exercise fake events."
```

Codex-native file and shell tools stay disabled in this harness path. Trading,
research, risk, proposal, and deployment tools must route through OpenStrat's
audited `AgentToolGateway`. OpenRouter/BYOK support is intentionally limited to
model/profile boundaries for now.
