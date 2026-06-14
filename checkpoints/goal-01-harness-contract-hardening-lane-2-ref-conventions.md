# Lane 2 Checkpoint: Artifact And Ref Conventions

Date: 2026-06-14
Branch: `codex/goal-01-harness-contract-hardening`

## Files Changed

- `packages/domain/src/common.ts`
- `packages/domain/src/agent.ts`
- `packages/domain/src/agent-contracts.test.ts`
- `packages/persistence/src/object-store.ts`
- `packages/persistence/src/persistence.test.ts`
- `docs/harness-contracts.md`
- `checkpoints/goal-01-harness-contract-hardening-lane-2-ref-conventions.md`

## What Changed

- Added domain-level object ref schemas:
  - `ObjectRefSchema`
  - `AppendOnlyObjectRefSchema`
  - `ProposalObjectRefSchema`
  - `CanonicalObjectRefSchema`
- Added ref classifier helpers:
  - `isObjectRef`
  - `isProposalObjectRef`
  - `isCanonicalObjectRef`
- `ObjectRefSchema` now rejects refs with empty path segments, `.`, `..`, absolute paths, Windows-style paths, backslashes, and null bytes before persistence touches disk.
- Agent proposal artifacts now require `artifact_ref.uri` to live under proposal storage: `agent-artifacts/` or `scratch/`.
- `FileObjectStore` now consumes and re-exports the domain `ObjectRefSchema` instead of owning a persistence-local non-empty string alias.
- Added `docs/harness-contracts.md` to document the ref taxonomy, proposal boundary, and persistence boundary.

## TDD Evidence

- Red test added first in `packages/domain/src/agent-contracts.test.ts`.
- Initial focused run failed because:
  - canonical storage was accepted as a proposal artifact ref
  - shared object/proposal/canonical ref schemas were not implemented
- Implementation then added shared domain helpers, proposal artifact validation, and persistence usage of the domain schema.
- Focused green run passed:
  - `pnpm test packages/domain/src/agent-contracts.test.ts packages/persistence/src/persistence.test.ts`
  - 2 test files passed, 12 tests passed.

## Commands Run

- `pnpm test packages/domain/src/agent-contracts.test.ts`
- `pnpm test packages/domain/src/agent-contracts.test.ts packages/persistence/src/persistence.test.ts`
- `pnpm --filter @openstrat/domain build`
- `pnpm exec prettier --write packages/domain/src/agent-contracts.test.ts docs/harness-contracts.md`
- `pnpm test`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm build`
- `git diff --check`

## Pass/Fail Status

- Focused red test failed for the expected missing-contract reasons.
- Focused green tests passed: 12 tests.
- Full test suite passed: 19 test files, 93 tests.
- Workspace typecheck passed after refreshing built domain declarations.
- Lint passed.
- Format check passed.
- Build passed.
- Whitespace diff check passed.

## Remaining Issues

- `SourceRefSchema` is still intentionally broad. Later lanes should only narrow specific call sites where an object-store ref is required.
- Existing CLI outputs still mix human lines and direct JSON. Lane 5 should use these ref helpers inside a shared command result envelope.
- Runtime and gateway event envelopes still differ. Lane 3 should standardize event/result envelopes without collapsing useful distinctions between runtime projection and gateway audit events.
- Package-level `pnpm typecheck` can observe stale generated declarations after adding cross-package exports. Running `pnpm build` refreshes those local declarations.

## Next Lane Unlocked

Lane 3: Event and result envelopes. Object/proposal/canonical refs now have a shared domain contract, so event and result payloads can reference harness artifacts without relying on loose strings or path-name conventions alone.
