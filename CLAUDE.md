# CLAUDE.md

Notes for Claude Code sessions working in this repository.

## Pull request titles

The `title / Validate PR title` required check (`.github/workflows/semantic_pr.yml`) fails any PR whose title does not match:

```
<type>(<LINEAR-ID>): <summary>
```

- `<type>` is one of `fix`, `feat`, `ci`, `docs`, `chore`, `test`.
- `<LINEAR-ID>` is the Linear ticket, e.g. `ENG-28`. Use `ENG-00` when there is no ticket.
- Example: `docs(ENG-00): document OWNERS as space-separated`.

Use the same format for commit subjects. The PR title is set separately from the commit, including when a PR is opened from the Claude Code UI, so after any PR is created for your branch, read its title and fix it if it does not match.

## Checks before pushing

CI runs all four on every pull request:

```bash
yarn format:check
yarn lint
yarn check-types
yarn build
```
