# Lane 7 Checkpoint: Docs and Final Gates

Date: 2026-06-11
Branch: `codex/codex-app-server-runtime`

## Files Changed

- `packages/cli/README.md`

## What Changed

- Documented `openstrat chat` as the Codex app-server default runtime path.
- Documented Codex binding, transcript, and event-log storage locations.
- Documented `openstrat chat --resume <session_id>`.
- Documented explicit Pi fallback via `openstrat chat --runtime pi`.
- Documented that Codex-native file and shell tools stay disabled and harness tools route through `AgentToolGateway`.
- Documented that OpenRouter/BYOK support remains limited to model/profile boundaries for now.

## Commands Run

- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm build`
- `git diff --check`

## Pass/Fail Status

- Full test suite: passed, 19 files and 92 tests.
- Workspace typecheck: passed.
- Workspace lint: passed.
- Repository format check: passed.
- Workspace build: passed.
- Whitespace diff check: passed.

## Commit Trail

- `51ca053` `feat: split codex app-server runtime contracts`
- `afd5979` `feat: scaffold codex app-server adapter`
- `6236fb6` `feat: persist codex app-server sessions`
- `10c7fbc` `feat: route codex tools through gateway`
- `be7ddc0` `feat: default chat to codex app server`
- `0015ac3` `feat: resume codex chat sessions`

## Remaining Issues

- The Codex app-server adapter is still a fake/scaffold boundary, not a live native app-server client.
- OpenRouter is intentionally not implemented beyond model/profile validation boundaries.
- Ignored build outputs under package `dist/` directories were refreshed by `pnpm build` and left unstaged.

## Goal Status

The Codex app-server integration scaffold is complete through runtime contracts, adapter boundary, durable bindings, transcript/event projection, gateway-routed tools, Codex-first CLI chat, CLI resume, documentation, and final verification gates.
