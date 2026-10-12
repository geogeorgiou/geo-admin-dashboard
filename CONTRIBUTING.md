# Contributing

Geo Admin Dashboard is a personal, local-only project. Setup and the database workflow are in the
[README](README.md); code conventions and project structure are in [AGENTS.md](AGENTS.md).

## Workflow

- Branch off `main` for every change:
  ```bash
  git checkout -b feat/my-update
  ```
- Use conventional commit prefixes (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`).
- Husky runs Biome on staged files at commit time; fix any errors it reports before committing.
- Include screenshots in the PR for new screens or visible UI changes, with mobile and dark-theme states when relevant.

## Never commit data

The repo is public and the database is local state only. Keep these out of git (all are gitignored):

- `db-backup/` and any `*.backup` file: database snapshots, including auth users and finance data
- `.env*.local`: Supabase URLs and keys
- Finance data exports, such as monthly flows JSON passed to `npm run seed:finances`

Check `git status` before committing, and never force-add an ignored file.
