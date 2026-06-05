# Contributing

Thanks for your interest in contributing to `@usarral/century-link-ts`.

## Before you start

- Check existing [issues](../../issues) and [pull requests](../../pulls) to avoid duplicating work.
- For significant changes, open an issue first to discuss the approach.

## Setup

```bash
git clone https://github.com/usarral/century-link-ts.git
cd century-link-ts
pnpm install
pnpm typecheck
pnpm test
```

## Project structure

```
src/
  domain/          ← entities, port interfaces — no dependencies
  application/     ← Result<T>, ElegooError, use cases
  infrastructure/  ← transport adapters (MQTT, WebSocket, UDP, HTTP)
  CenturyLink.ts   ← public facade
```

The domain layer must stay dependency-free. New protocol features go in `infrastructure/adapters/`.

## Adding support for a new printer

1. Create `src/infrastructure/adapters/<name>/` with a `PrinterAdapter` implementation.
2. Add the printer type to `src/domain/types/PrinterType.ts`.
3. Register the adapter in `src/infrastructure/factory/PrinterAdapterFactory.ts`.
4. Test against real hardware and state the model in your PR.
5. Update the supported printers table in `README.md`.

## Code style

- TypeScript strict mode — no `any`, no non-null assertions without justification.
- No comments explaining *what* the code does — only *why* when non-obvious.
- `pnpm typecheck` and `pnpm test` must pass before opening a PR.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add support for Neptune 4 Max
fix: correct canvas_info field mapping on CC2
docs: add Moonraker connection example
```

## Releasing (maintainer only)

```bash
npm version patch   # or minor / major
git push && git push --tags
```

The GitHub Action publishes to npm automatically on version tags.
