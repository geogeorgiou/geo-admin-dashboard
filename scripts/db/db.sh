#!/usr/bin/env bash
# Local Supabase lifecycle around db-backup/, the gitignored source of truth for the database. The newest
# <ISO date>_db_cluster.backup wins; hosted-export.backup (the original hosted download) is the fallback.
#
#   db.sh start     start the stack; restore the newest backup if the database is empty
#   db.sh stop      snapshot, then stop the stack (data stays in the Docker volume)
#   db.sh snapshot  dump the cluster to a new dated backup in db-backup/
#   db.sh reset     snapshot, wipe the Docker volume, restore the newest backup

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SNAPSHOT_DIR="$ROOT/db-backup"
HOSTED_EXPORT="$SNAPSHOT_DIR/hosted-export.backup"
KEEP_SNAPSHOTS=30
# Set while the volume holds a partial restore, so a snapshot can't record it as the newest backup.
RESTORE_FAILED_MARKER="$ROOT/supabase/.temp/restore-failed"

cd "$ROOT"

PROJECT_ID="$(sed -n 's/^project_id = "\(.*\)"/\1/p' supabase/config.toml)"
DB_CONTAINER="supabase_db_${PROJECT_ID}"

db_running() {
  [ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null)" = "true" ]
}

psql_admin() {
  docker exec -i "$DB_CONTAINER" psql -U supabase_admin -d postgres "$@"
}

public_table_count() {
  psql_admin -tAc "select count(*) from information_schema.tables where table_schema = 'public'"
}

# Newest dated backup, else the hosted export, else nothing. ISO names sort chronologically.
latest_backup() {
  local newest
  newest="$(ls -1 "$SNAPSHOT_DIR"/*_db_cluster.backup 2>/dev/null | sort -r | head -1 || true)"
  if [ -n "$newest" ]; then
    echo "$newest"
  elif [ -f "$HOSTED_EXPORT" ]; then
    echo "$HOSTED_EXPORT"
  fi
}

restore() {
  local backup
  backup="$(latest_backup)"
  if [ -z "$backup" ]; then
    echo "No backup in $SNAPSHOT_DIR to restore; starting with an empty database."
    return
  fi

  local log
  log="$(mktemp)"
  echo "Restoring $backup..."
  mkdir -p "$(dirname "$RESTORE_FAILED_MARKER")"
  touch "$RESTORE_FAILED_MARKER"
  # Replica mode skips FK checks: the dump loads tables alphabetically (auth.identities before auth.users),
  # but the local stack already has the FKs the dump would only add after its data.
  docker exec -i -e PGOPTIONS="-c session_replication_role=replica" "$DB_CONTAINER" \
    psql -U supabase_admin -d postgres -q -f - <"$backup" >/dev/null 2>"$log" || true

  # Cluster dumps recreate roles, schemas, keys, realtime partitions, and migration/tenant rows the local stack
  # already has; those errors are expected.
  local unexpected
  unexpected="$(
    grep 'ERROR' "$log" |
      grep -v 'already exists' |
      grep -v 'multiple primary keys for table' |
      grep -v 'is already a partition' |
      grep -vE 'is already member of publication "logflare_pub"' |
      grep -vE 'duplicate key value violates unique constraint "(schema_migrations_pkey|migrations_pkey|extensions_tenant_external_id_type_index|feature_flags_name_index|tenants_external_id_index)"' ||
      true
  )"
  if [ -n "$unexpected" ]; then
    echo "Restore finished with unexpected errors (full log: $log):"
    echo "$unexpected" | head -20
    echo "Snapshots are blocked until a restore succeeds (npm run db:reset)."
    exit 1
  fi
  rm -f "$log" "$RESTORE_FAILED_MARKER"
  # PostgREST cached the schema at `supabase start`, before the restored tables existed.
  psql_admin -qc "notify pgrst, 'reload schema'"
  echo "Restored $(public_table_count) public tables."
}

snapshot() {
  if ! db_running; then
    echo "Database is not running; nothing to snapshot."
    return
  fi
  if [ -f "$RESTORE_FAILED_MARKER" ]; then
    echo "Last restore failed; refusing to snapshot. Fix it and run npm run db:reset."
    return
  fi
  # Guard against an empty database becoming the newest backup.
  if [ "$(public_table_count)" -eq 0 ]; then
    echo "Public schema is empty; refusing to snapshot."
    return
  fi

  mkdir -p "$SNAPSHOT_DIR"
  # Dump outside the dated naming so a failed dump never becomes the newest backup.
  local tmp="$SNAPSHOT_DIR/.dump-in-progress"
  # _supabase and storage_vectors are local-stack internals that `supabase start` recreates; the hosted export has
  # neither.
  docker exec "$DB_CONTAINER" pg_dumpall -U supabase_admin \
    --exclude-database=_supabase --exclude-database=storage_vectors >"$tmp"

  local dated
  dated="$SNAPSHOT_DIR/$(date -u +%Y-%m-%dT%H-%M-%SZ)_db_cluster.backup"
  mv "$tmp" "$dated"
  echo "Wrote $dated"

  ls -1 "$SNAPSHOT_DIR"/*_db_cluster.backup | sort -r | tail -n +$((KEEP_SNAPSHOTS + 1)) | while read -r old; do
    rm -f "$old"
  done
}

case "${1:-}" in
  start)
    supabase start
    if [ "$(public_table_count)" -eq 0 ]; then
      restore
    fi
    ;;
  stop)
    snapshot
    supabase stop
    ;;
  snapshot)
    snapshot
    ;;
  reset)
    snapshot
    supabase stop --no-backup
    supabase start
    restore
    ;;
  *)
    echo "Usage: $0 {start|stop|snapshot|reset}" >&2
    exit 1
    ;;
esac
