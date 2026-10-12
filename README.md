# Geo Admin Dashboard

A personal admin dashboard built with Next.js 16, React 19, TypeScript, Tailwind CSS v4, and shadcn/ui.

> [!IMPORTANT]
> **Local state only.** This project runs on your machine against a local Supabase stack in Docker. It is not deployed
> anywhere and has no hosted backend. The data lives in the local Docker volume and in gitignored backups under
> `db-backup/`, and is never committed.

## Screens

- **Finance**: household accounts and monthly flows, read from and written to the local Supabase database
- **Default**, **CRM**, **Analytics**, **Productivity**: dashboards with static sample data

Theme presets (neutral, Tangerine, Neo Brutalism, Soft Pop), light/dark mode, and layout controls (collapsible sidebar,
content width) are built in.

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **UI**: shadcn/ui
- **Data**: Supabase (local stack via the Supabase CLI)
- **Validation & forms**: Zod, React Hook Form
- **State & tables**: Zustand, TanStack Table
- **Tooling**: Biome, Husky

## Getting Started

### Prerequisites

- Node.js and npm
- Docker (running)
- [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)

### Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Add the database backup.** Put a Supabase cluster backup (the dashboard's "Download backup" file) at
   `db-backup/hosted-export.backup`. Skip this to start with an empty database.

3. **Start Supabase.** On an empty database this restores the newest backup (see below).
   ```bash
   npm run db:start
   ```

4. **Point the app at the local stack.** Create `.env.local` from the values printed by `supabase status`:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY>
   SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
   SUPABASE_SECRET_KEY=<SECRET_KEY>
   ```

5. **Start the app**
   ```bash
   npm run dev
   ```

The app runs at [http://localhost:3000](http://localhost:3000). Supabase Studio is at
[http://127.0.0.1:54323](http://127.0.0.1:54323).

## Database

`db-backup/` is the source of truth for the database. It is gitignored and holds:

- `<ISO date>_db_cluster.backup`: snapshots of the local database; the newest one wins
- `hosted-export.backup`: the original export, used only when there are no snapshots

| Command               | What it does                                                                         |
| --------------------- | ------------------------------------------------------------------------------------ |
| `npm run db:start`    | Starts the stack. Restores the newest backup only when the database is empty.        |
| `npm run db:stop`     | Snapshots, then stops the stack. Data also stays in the Docker volume.               |
| `npm run db:snapshot` | Writes a new dated snapshot without stopping.                                        |
| `npm run db:reset`    | Snapshots, wipes the Docker volume, and restores the newest backup.                  |
| `npm run db:types`    | Regenerates `src/lib/supabase/database.types.ts` from the local database.            |

The last 30 snapshots are kept; `hosted-export.backup` is never pruned. Stop with `npm run db:stop` rather than quitting
Docker so the latest changes reach `db-backup/`.

**Rolling back:** move away the snapshots newer than the one you want, then wipe and restart:

```bash
supabase stop --no-backup && npm run db:start
```

Avoid `db:reset` for a rollback: its snapshot would become the newest backup.

## Development

```bash
npm run check       # Biome lint + format check
npm run check:fix   # apply fixes
npm run build       # production build
```

Feature code stays next to the route that owns it (`src/app/(main)/dashboard/<screen>/_components/`), with shared UI,
hooks, and utilities at the top level. See [AGENTS.md](AGENTS.md) for conventions.

## Credits

Based on [Studio Admin](https://github.com/arhamkhnz/next-shadcn-admin-dashboard) by Mohammed Arham Khan, MIT
licensed. See [LICENSE](LICENSE).
