# OpenStrat CLI

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
