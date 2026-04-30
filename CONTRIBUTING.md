# Contributing

## Local Development

Requirements:

- Node.js 22+
- npm

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

By default, the app will create local data directories if you do not set custom paths. For repeatable local testing, copying `.env.example` to a local env file is recommended.

## Tests

Run the test suite with:

```bash
npm test
```

Before opening a pull request, also run:

```bash
npm run lint
npm test
```

## Pull Requests

Please keep PRs focused.

Guidelines:

- One logical change per PR
- Include tests when behavior changes
- Avoid unrelated cleanup in the same branch
- Update docs if config, install flow, or behavior changes

If a change affects deployment, storage behavior, uploads, previews, or middleware, call that out clearly in the PR description.
