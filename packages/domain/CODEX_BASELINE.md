# Codex SDK Baseline

Status: Draft
Date: 2026-06-22

OpenStrat treats Codex as the model, auth, session, sandbox, approval, and coding harness layer. OpenStrat is the trading product layer around that harness.

Codex owns:

- ChatGPT/API-key auth and token handling.
- Model selection, conversation threads, turn execution, event streaming, resume, fork, and compaction.
- Native file and shell tools for code generation and verification.
- Sandboxing and approval prompts around native tools.

OpenStrat owns:

- Project and user trading config.
- Market data, dataset provenance, strategy workspace contracts, validation, backtesting, risk policy, deployment gates, artifact indexes, and decision memory.
- Builder-code config and future wallet handles.

OpenStrat should not replace Codex native file/shell tools. The trading boundary is enforced by requiring generated strategies to use OpenStrat strategy contracts and harness-shaped intents instead of direct exchange calls.

The code-level source of truth is `OPENSTRAT_CODEX_BASELINE_CONTRACT` in `src/codex.ts`. It keeps `codex_sdk` and `codex_app_server` as baseline runtime kinds, keeps `pi` and `openclaw_compat` out of the runtime enum, and states that Codex tokens, private keys, seed phrases, wallet signing keys, and exchange secrets are not OpenStrat-owned storage.
