# Contributing to Beacon

Thanks for your interest in contributing! 🎉

## Getting started

1. Fork the repository and clone your fork:

   ```bash
   git clone https://github.com/muraa-p/beacon.git
   cd beacon
   ```

2. Install dependencies (Node.js 24+ required):

   ```bash
   npm install
   ```

3. Start in development mode (API on :8080, dashboard with hot reload on :5173):

   ```bash
   npm run dev
   ```

## Before you open a PR

Run the same checks CI runs:

```bash
npm run typecheck   # TypeScript, both packages
npm test            # unit tests
npm run build       # production build
```

All three must pass.

## Project structure

- `server/` — Express + TypeScript API, background checker, notifier
- `client/` — React + Vite dashboard
- `server/tests/` — unit tests (Vitest)

## Code style

- TypeScript strict mode — no `any` unless truly unavoidable
- Small, focused files and functions
- Prefer the standard library / built-ins over new dependencies (Beacon's zero-dependency-ish nature is a feature)
- Keep the UI minimal and accessible

## Reporting bugs

Use the [bug report template](../../issues/new?template=bug_report.yml). Include your environment (OS, Node version, Docker or bare metal) and steps to reproduce.

## Suggesting features

Use the [feature request template](../../issues/new?template=feature_request.yml). Describe the problem you're solving, not just the solution — that helps us discuss the right fix.

**Working on a larger feature?** Open an issue first so we can align on the approach before you invest time.

## Pull request process

1. Create a branch: `git checkout -b feature/my-change`
2. Make your changes with tests where it makes sense
3. Run `npm run typecheck && npm test && npm run build`
4. Open a PR using the template — describe what and why
5. Be responsive to review feedback

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE), the same license that covers the project.

## Conduct

This project follows a [Code of Conduct](CODE_OF_CONDUCT.md). Be kind and constructive.