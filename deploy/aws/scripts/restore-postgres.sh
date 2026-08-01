#!/usr/bin/env bash

set -euo pipefail

if [[ "${DEPLOY_ENV:-}" != 'rehearsal' ]]; then
  printf 'restore requires DEPLOY_ENV=rehearsal\n' >&2
  exit 64
fi

if [[ "${CONFIRM_RESTORE:-}" != 'semcomp-rehearsal' ]]; then
  printf 'restore requires CONFIRM_RESTORE=semcomp-rehearsal\n' >&2
  exit 64
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/../../.." && pwd)"

: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"

compose_file="$project_dir/deploy/aws/compose.yml"
compose_project_name="${COMPOSE_PROJECT_NAME:-semcomp-rehearsal}"
compose_env_file="${COMPOSE_ENV_FILE:-}"
aws_region="${AWS_REGION:-sa-east-1}"
backup_key="${BACKUP_KEY:-}"
backup_s3_uri="${BACKUP_S3_URI:-}"
healthcheck_url="${HEALTHCHECK_URL:-http://127.0.0.1/api/health}"
healthcheck_timeout_seconds="${HEALTHCHECK_TIMEOUT_SECONDS:-120}"

case "$compose_project_name" in
  semcomp-rehearsal|semcomp-rehearsal-*) ;;
  *)
    printf 'COMPOSE_PROJECT_NAME must identify the rehearsal environment\n' >&2
    exit 64
    ;;
esac

if [[ -n "$backup_s3_uri" && -n "$backup_key" ]]; then
  printf 'set only one of BACKUP_S3_URI or BACKUP_KEY\n' >&2
  exit 64
fi

if [[ -z "$backup_s3_uri" ]]; then
  if [[ -z "$backup_key" ]]; then
    printf 'BACKUP_KEY or BACKUP_S3_URI is required\n' >&2
    exit 64
  fi
  backup_s3_uri="s3://${BACKUP_BUCKET}/${backup_key}"
fi

expected_s3_prefix="s3://${BACKUP_BUCKET}/backups/"
if [[ "$backup_s3_uri" != "$expected_s3_prefix"* || "$backup_s3_uri" == *'..'* || "$backup_s3_uri" == "$expected_s3_prefix" || "$backup_s3_uri" == "${expected_s3_prefix}.staging/"* ]]; then
  printf 'restore source must be below the configured rehearsal backups/ prefix\n' >&2
  exit 64
fi

compose_args=(
  --project-directory "$project_dir"
  --project-name "$compose_project_name"
  --file "$compose_file"
)
if [[ -n "$compose_env_file" ]]; then
  compose_args+=(--env-file "$compose_env_file")
fi

if [[ ! "$healthcheck_timeout_seconds" =~ ^[0-9]+$ ]]; then
  printf 'HEALTHCHECK_TIMEOUT_SECONDS must be a non-negative integer\n' >&2
  exit 64
fi
healthcheck_timeout_seconds=$((10#$healthcheck_timeout_seconds))

application_running=1
maintenance_started=0
swap_completed=0
replacement_validated=0
database_recovery_required=0
swap_recovery_failure_marker='__SEMCOMP_SWAP_RECOVERY_REQUIRED__'
previous_db=''

compose() {
  docker compose "${compose_args[@]}" "$@"
}

enter_maintenance() {
  local status=0

  maintenance_started=1
  application_running=0
  compose stop nginx || status=$?
  compose stop web || status=$?
  compose stop api || status=$?
  return "$status"
}

start_application() {
  local status=0

  application_running=1
  compose start api || status=$?
  compose start web || status=$?
  compose start nginx || status=$?
  return "$status"
}

wait_for_health() {
  local deadline=$((SECONDS + healthcheck_timeout_seconds))

  while true; do
    if curl --fail --silent --show-error --connect-timeout 3 --max-time 5 \
      "$healthcheck_url" > /dev/null; then
      return 0
    fi
    if (( SECONDS >= deadline )); then
      return 1
    fi
    sleep 2
  done
}

drop_previous_database() {
  local database_name="$1"

  compose exec -T -e PREVIOUS_DB="$database_name" postgres sh -c '
    set -eu
    export PGPASSWORD="$POSTGRES_PASSWORD"
    maintenance_db=postgres
    if [ "$POSTGRES_DB" = postgres ]; then
      maintenance_db=template1
    fi
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$maintenance_db" \
      -v previous_db="$PREVIOUS_DB" \
      -c "DROP DATABASE :\"previous_db\" WITH (FORCE);" \
      > /dev/null
  '
}

rollback_database() {
  local database_name="$1"

  compose exec -T -e PREVIOUS_DB="$database_name" postgres sh -c '
    set -eu

    export PGPASSWORD="$POSTGRES_PASSWORD"
    target_db="$POSTGRES_DB"
    db_owner="$POSTGRES_USER"
    previous_db="$PREVIOUS_DB"
    maintenance_db=postgres
    if [ "$target_db" = postgres ]; then
      maintenance_db=template1
    fi

    suffix="$(date -u +%s)_$$"
    failed_db="${target_db}_failed_${suffix}"
    if [ "${#failed_db}" -gt 63 ]; then
      printf "%s\n" "restore target name is too long for a failed database" >&2
      exit 64
    fi

    target_blocked=0
    failed_renamed=0
    previous_renamed=0

    cleanup() {
      status=$?
      set +e

      if [ "$previous_renamed" -eq 1 ]; then
        psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
          -v target_db="$target_db" \
          -c "ALTER DATABASE :\"target_db\" WITH ALLOW_CONNECTIONS true;" \
          > /dev/null 2>&1
      elif [ "$failed_renamed" -eq 1 ]; then
        psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
          -v failed_db="$failed_db" -v target_db="$target_db" \
          -c "ALTER DATABASE :\"failed_db\" RENAME TO :\"target_db\";" \
          > /dev/null 2>&1
        psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
          -v target_db="$target_db" \
          -c "ALTER DATABASE :\"target_db\" WITH ALLOW_CONNECTIONS true;" \
          > /dev/null 2>&1
      elif [ "$target_blocked" -eq 1 ]; then
        psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
          -v target_db="$target_db" \
          -c "ALTER DATABASE :\"target_db\" WITH ALLOW_CONNECTIONS true;" \
          > /dev/null 2>&1
      fi

      exit "$status"
    }
    trap cleanup EXIT

    psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
      -v target_db="$target_db" \
      -c "ALTER DATABASE :\"target_db\" WITH ALLOW_CONNECTIONS false;" \
      > /dev/null
    target_blocked=1

    psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
      -v target_db="$target_db" -v previous_db="$previous_db" \
      -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN (:'\''target_db'\'', :'\''previous_db'\'') AND pid <> pg_backend_pid();" \
      > /dev/null

    psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
      -v target_db="$target_db" -v failed_db="$failed_db" \
      -c "ALTER DATABASE :\"target_db\" RENAME TO :\"failed_db\";" \
      > /dev/null
    failed_renamed=1

    psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
      -v previous_db="$previous_db" -v target_db="$target_db" \
      -c "ALTER DATABASE :\"previous_db\" RENAME TO :\"target_db\";" \
      > /dev/null
    previous_renamed=1

    psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
      -v target_db="$target_db" \
      -c "ALTER DATABASE :\"target_db\" WITH ALLOW_CONNECTIONS true;" \
      > /dev/null
    target_blocked=0

    psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
      -v failed_db="$failed_db" \
      -c "DROP DATABASE :\"failed_db\" WITH (FORCE);" \
      > /dev/null

    trap - EXIT
  '
}

umask 077
restore_dir="$(mktemp -d "${TMPDIR:-/tmp}/semcomp-restore.XXXXXXXX")"
restore_dump="$restore_dir/database.dump"

cleanup() {
  local status=$?
  local recovery_failed="$database_recovery_required"

  set +e
  if [[ "$status" -ne 0 && "$swap_completed" -eq 1 && "$replacement_validated" -eq 0 ]]; then
    if [[ "$application_running" -eq 1 ]]; then
      if ! enter_maintenance; then
        printf 'failed to stop application services before rollback\n' >&2
      fi
    fi
    if rollback_database "$previous_db"; then
      swap_completed=0
    else
      recovery_failed=1
      printf 'failed to roll back the restored database\n' >&2
    fi
  fi
  if [[ "$maintenance_started" -eq 1 && "$application_running" -eq 0 && "$recovery_failed" -eq 0 ]]; then
    if ! start_application; then
      printf 'failed to restart application services during cleanup\n' >&2
    fi
  fi
  rm -rf -- "$restore_dir"
  exit "$status"
}
trap cleanup EXIT

aws s3 cp "$backup_s3_uri" "$restore_dump" --region "$aws_region" --only-show-errors
if [[ ! -s "$restore_dump" ]]; then
  printf 'downloaded restore archive is empty\n' >&2
  exit 1
fi

enter_maintenance

swap_status=0
if previous_db="$(compose exec -T \
  -e SWAP_RECOVERY_FAILURE_MARKER="$swap_recovery_failure_marker" \
  postgres sh -c '
  set -eu

  export PGPASSWORD="$POSTGRES_PASSWORD"
  target_db="$POSTGRES_DB"
  db_owner="$POSTGRES_USER"
  maintenance_db=postgres

  case "$target_db" in
    postgres)
      maintenance_db=template1
      ;;
    template0|template1)
      printf "%s\n" "restore target must be an application database" >&2
      exit 64
      ;;
  esac

  suffix="$(date -u +%s)_$$"
  restore_db="${target_db}_restore_${suffix}"
  previous_db="${target_db}_previous_${suffix}"

  if [ "${#restore_db}" -gt 63 ] || [ "${#previous_db}" -gt 63 ]; then
    printf "%s\n" "restore target name is too long for a temporary database" >&2
    exit 64
  fi

  restore_created=0
  target_blocked=0
  target_renamed=0
  restore_renamed=0

  cleanup() {
    status=$?
    recovery_failed=0
    set +e

    if [ "$target_renamed" -eq 1 ] && [ "$restore_renamed" -eq 0 ]; then
      if ! psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
          -v previous_db="$previous_db" -v target_db="$target_db" \
          -c "ALTER DATABASE :\"previous_db\" RENAME TO :\"target_db\";" \
          > /dev/null 2>&1; then
        recovery_failed=1
        printf "%s\n" \
          "failed to restore the original database name after swap failure" >&2
      fi
    fi

    if [ "$target_blocked" -eq 1 ] && [ "$restore_renamed" -eq 0 ]; then
      if ! psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
          -v target_db="$target_db" \
          -c "ALTER DATABASE :\"target_db\" WITH ALLOW_CONNECTIONS true;" \
          > /dev/null 2>&1; then
        recovery_failed=1
        printf "%s\n" \
          "failed to re-enable the original database after swap failure" >&2
      fi
    fi

    if [ "$restore_created" -eq 1 ] && [ "$restore_renamed" -eq 0 ]; then
      psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
        -v restore_db="$restore_db" \
        -c "DROP DATABASE IF EXISTS :\"restore_db\" WITH (FORCE);" \
        > /dev/null 2>&1
    fi

    if [ "$recovery_failed" -eq 1 ]; then
      printf "%s\n" "$SWAP_RECOVERY_FAILURE_MARKER"
    fi
    exit "$status"
  }
  trap cleanup EXIT

  psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
    -v restore_db="$restore_db" -v db_owner="$db_owner" \
    -c "CREATE DATABASE :\"restore_db\" OWNER :\"db_owner\" TEMPLATE template0;" \
    > /dev/null
  restore_created=1

  pg_restore --exit-on-error --single-transaction --no-owner --no-privileges \
    -U "$db_owner" -d "$restore_db"

  psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
    -v target_db="$target_db" \
    -c "ALTER DATABASE :\"target_db\" WITH ALLOW_CONNECTIONS false;" \
    > /dev/null
  target_blocked=1

  psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
    -v target_db="$target_db" -v restore_db="$restore_db" \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN (:'\''target_db'\'', :'\''restore_db'\'') AND pid <> pg_backend_pid();" \
    > /dev/null

  psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
    -v target_db="$target_db" -v previous_db="$previous_db" \
    -c "ALTER DATABASE :\"target_db\" RENAME TO :\"previous_db\";" \
    > /dev/null
  target_renamed=1

  psql -v ON_ERROR_STOP=1 -U "$db_owner" -d "$maintenance_db" \
    -v restore_db="$restore_db" -v target_db="$target_db" \
    -c "ALTER DATABASE :\"restore_db\" RENAME TO :\"target_db\";" \
    > /dev/null
  restore_renamed=1

  trap - EXIT
  printf "%s\n" "$previous_db"
' < "$restore_dump")"; then
  :
else
  swap_status=$?
fi

if [[ "$swap_status" -ne 0 ]]; then
  if [[ "$previous_db" == "$swap_recovery_failure_marker" ]]; then
    database_recovery_required=1
    printf 'database swap recovery failed; application services will remain stopped\n' >&2
  fi
  exit "$swap_status"
fi

if [[ -z "$previous_db" || "$previous_db" == *$'\n'* ]]; then
  printf 'restore did not return a valid previous database name\n' >&2
  exit 1
fi
swap_completed=1

compose run -T --rm --no-deps migrate
start_application
wait_for_health
replacement_validated=1
drop_previous_database "$previous_db"
swap_completed=0
maintenance_started=0
printf 'restore completed; /api/health passed\n'
