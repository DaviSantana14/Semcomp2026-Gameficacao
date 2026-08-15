#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/../../.." && pwd)"
restore_script="$script_dir/restore-postgres.sh"
backup_script="$script_dir/backup-postgres.sh"

if [[ ! -x "$backup_script" || ! -x "$restore_script" ]]; then
  printf 'deployment scripts must be executable\n' >&2
  exit 1
fi

assert_contains() {
  local value="$1"
  local expected="$2"
  local message="$3"

  if [[ "$value" != *"$expected"* ]]; then
    printf '%s\n' "$message" >&2
    exit 1
  fi
}

assert_not_contains() {
  local value="$1"
  local unexpected="$2"
  local message="$3"

  if [[ "$value" == *"$unexpected"* ]]; then
    printf '%s\n' "$message" >&2
    exit 1
  fi
}

assert_order() {
  local events="$1"
  local before="$2"
  local after="$3"
  local message="$4"

  if [[ "$events" != *"$before"*"$after"* ]]; then
    printf '%s\n' "$message" >&2
    exit 1
  fi
}

if ! grep -Fq '"test:deployment-scripts"' "$project_dir/package.json"; then
  printf 'deployment script suite is not exposed by package.json\n' >&2
  exit 1
fi
if ! grep -Fq 'npm run test:deployment-scripts' "$project_dir/.github/workflows/ci.yml"; then
  printf 'deployment script suite is not called by CI\n' >&2
  exit 1
fi

for compose_script in "$backup_script" "$restore_script"; do
  assert_contains "$(< "$compose_script")" 'compose_dir="$project_dir/deploy/aws"' \
    'database script does not anchor Compose paths in deploy/aws'
  assert_contains "$(< "$compose_script")" '--project-directory "$compose_dir"' \
    'database script resolves Compose contexts outside deploy/aws'
done

output=''
status=0
set +e
output="$(
  DEPLOY_ENV=production \
  CONFIRM_RESTORE=semcomp-rehearsal \
  bash "$restore_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'restore must reject non-rehearsal environments\n' >&2
  exit 1
fi

if [[ "$output" != *'DEPLOY_ENV=rehearsal'* ]]; then
  printf 'restore gate message was not found\n' >&2
  exit 1
fi

printf 'restore environment gate: ok\n'

output=''
status=0
set +e
output="$(
  DEPLOY_ENV=rehearsal \
  CONFIRM_RESTORE=wrong-confirmation \
  bash "$restore_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'restore must reject an invalid confirmation\n' >&2
  exit 1
fi
assert_contains "$output" 'CONFIRM_RESTORE=semcomp-rehearsal' \
  'restore confirmation gate message was not found'

test_root="$(mktemp -d)"
cleanup() {
  rm -rf -- "$test_root"
}
trap cleanup EXIT

bin_dir="$test_root/bin"
mkdir -p "$bin_dir" "$test_root/tmp"

cat > "$bin_dir/aws" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

printf '%s\n' "$*" >> "$AWS_ARGS_CAPTURE"
if [[ "${2:-}" == 'rm' ]]; then
  exit 0
elif [[ "${3:-}" == '-' ]]; then
  if [[ "${4:-}" == *'/.staging/'* ]]; then
    cat > "$STAGING_CAPTURE"
  else
    cat > "$PUBLISHED_CAPTURE"
  fi
elif [[ "${3:-}" == s3://* && "${4:-}" == s3://* ]]; then
  printf '%s\n' "$*" >> "$PROMOTION_CAPTURE"
  cp "$STAGING_CAPTURE" "$PUBLISHED_CAPTURE"
else
  printf 'restore-archive\n' > "${4:?restore destination is required}"
fi
EOF

cat > "$bin_dir/docker" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

printf '%s\n' "$*" >> "$DOCKER_CALLS_CAPTURE"
for ((arg_index = 1; arg_index <= $#; arg_index += 1)); do
  argument="${!arg_index}"
  if [[ "$argument" == '-e' || "$argument" == '--env' ]]; then
    value_index=$((arg_index + 1))
    export "${!value_index}"
  fi
done
if [[ "$*" == *' stop nginx'* ]]; then
  printf 'stop-nginx\n' >> "$EVENTS_CAPTURE"
elif [[ "$*" == *' stop web'* ]]; then
  printf 'stop-web\n' >> "$EVENTS_CAPTURE"
elif [[ "$*" == *' stop api'* ]]; then
  printf 'stop-api\n' >> "$EVENTS_CAPTURE"
elif [[ "$*" == *' start api'* ]]; then
  printf 'start-api\n' >> "$EVENTS_CAPTURE"
elif [[ "$*" == *' start web'* ]]; then
  printf 'start-web\n' >> "$EVENTS_CAPTURE"
  if [[ "${SIMULATE_WEB_START_FAILURE:-}" == '1' && ! -e "$WEB_START_FAILURE_MARKER" ]]; then
    : > "$WEB_START_FAILURE_MARKER"
    exit 46
  fi
elif [[ "$*" == *' start nginx'* ]]; then
  printf 'start-nginx\n' >> "$EVENTS_CAPTURE"
elif [[ "$*" == *' run -T --rm --no-deps migrate'* ]]; then
  printf 'migrate\n' >> "$EVENTS_CAPTURE"
  if [[ "${SIMULATE_MIGRATION_FAILURE:-}" == '1' ]]; then
    exit 44
  fi
elif [[ "$*" == *'pg_dump -Fc'* ]]; then
  printf 'backup-archive\n'
  if [[ "${SIMULATE_PG_DUMP_FAILURE:-}" == '1' ]]; then
    exit 42
  fi
elif [[ "$*" == *'pg_restore --exit-on-error'* ]]; then
  remote_command="${@: -1}"
  printf '%s\n' "$remote_command" > "$REMOTE_SCRIPT_CAPTURE"
  sh -n -c "$remote_command"
  sh -c "$remote_command"
elif [[ "$*" == *'psql -v ON_ERROR_STOP=1'* ]]; then
  remote_command="${@: -1}"
  sh -n -c "$remote_command"
  sh -c "$remote_command"
else
  printf 'unexpected docker operation\n' >&2
  exit 1
fi
EOF

cat > "$bin_dir/curl" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

printf '%s\n' "$*" > "$CURL_CAPTURE"
printf 'health\n' >> "$EVENTS_CAPTURE"
if [[ "${SIMULATE_HEALTH_FAILURE:-}" == '1' ]]; then
  exit 22
fi
EOF

cat > "$bin_dir/psql" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

printf '%s\n' "$*" >> "$PSQL_CALLS_CAPTURE"
if [[ "$*" == *'ALTER DATABASE :"target_db" WITH ALLOW_CONNECTIONS false'* ]]; then
  printf 'block-target\n' >> "$EVENTS_CAPTURE"
elif [[ "$*" == *'ALTER DATABASE :"target_db" WITH ALLOW_CONNECTIONS true'* ]]; then
  printf 'allow-target\n' >> "$EVENTS_CAPTURE"
  if [[ "${SIMULATE_SWAP_ALLOW_FAILURE:-}" == '1' ]]; then
    exit 49
  fi
elif [[ "$*" == *'ALTER DATABASE :"target_db" RENAME TO :"previous_db"'* ]]; then
  printf 'rename-target-to-previous\n' >> "$EVENTS_CAPTURE"
  if [[ "${SIMULATE_TARGET_RENAME_FAILURE:-}" == '1' ]]; then
    exit 50
  fi
elif [[ "$*" == *'ALTER DATABASE :"restore_db" RENAME TO :"target_db"'* ]]; then
  printf 'rename-restore-to-target\n' >> "$EVENTS_CAPTURE"
  if [[ "${SIMULATE_SWAP_RENAME_FAILURE:-}" == '1' ]]; then
    exit 47
  fi
elif [[ "$*" == *'ALTER DATABASE :"target_db" RENAME TO :"failed_db"'* ]]; then
  printf 'rename-target-to-failed\n' >> "$EVENTS_CAPTURE"
  if [[ "${SIMULATE_ROLLBACK_RENAME_FAILURE:-}" == '1' ]]; then
    exit 45
  fi
elif [[ "$*" == *'ALTER DATABASE :"previous_db" RENAME TO :"target_db"'* ]]; then
  printf 'rollback\n' >> "$EVENTS_CAPTURE"
  if [[ "${SIMULATE_SWAP_COMPENSATION_FAILURE:-}" == '1' ]]; then
    exit 48
  fi
elif [[ "$*" == *'DROP DATABASE :"previous_db"'* ]]; then
  printf 'drop-previous\n' >> "$EVENTS_CAPTURE"
elif [[ "$*" == *'DROP DATABASE :"failed_db"'* ]]; then
  printf 'drop-failed\n' >> "$EVENTS_CAPTURE"
fi
EOF

cat > "$bin_dir/pg_restore" <<'EOF'
#!/usr/bin/env bash

set -euo pipefail

printf 'restore\n' >> "$EVENTS_CAPTURE"
cat > "$RESTORE_CAPTURE"
if [[ "${SIMULATE_PG_RESTORE_FAILURE:-}" == '1' ]]; then
  exit 43
fi
EOF

chmod +x "$bin_dir/aws" "$bin_dir/docker" "$bin_dir/curl" "$bin_dir/psql" "$bin_dir/pg_restore"

export PATH="$bin_dir:$PATH"
export AWS_ARGS_CAPTURE="$test_root/aws.args"
export STAGING_CAPTURE="$test_root/staging.archive"
export PUBLISHED_CAPTURE="$test_root/published.archive"
export PROMOTION_CAPTURE="$test_root/promotion.calls"
export DOCKER_CALLS_CAPTURE="$test_root/docker.calls"
export RESTORE_CAPTURE="$test_root/restore.archive"
export CURL_CAPTURE="$test_root/curl.args"
export REMOTE_SCRIPT_CAPTURE="$test_root/remote-script.sh"
export PSQL_CALLS_CAPTURE="$test_root/psql.calls"
export EVENTS_CAPTURE="$test_root/events"
export WEB_START_FAILURE_MARKER="$test_root/web-start.failed"

backup_output="$(
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/test.dump \
  POSTGRES_PASSWORD= \
  POSTGRES_DB=semcomp_test \
  POSTGRES_USER=semcomp_test \
  COMPOSE_PROJECT_NAME=semcomp-rehearsal-test \
  bash "$backup_script"
)"

assert_contains "$(< "$PUBLISHED_CAPTURE")" 'backup-archive' \
  'backup did not stream the pg_dump output to AWS'
assert_contains "$(< "$DOCKER_CALLS_CAPTURE")" 'pg_dump -Fc' \
  'backup did not request PostgreSQL custom format'
assert_contains "$(< "$AWS_ARGS_CAPTURE")" '--sse AES256' \
  'backup did not request S3 server-side encryption'
assert_contains "$backup_output" 's3://semcomp-test-bucket/backups/test.dump' \
  'backup did not report the restore source'
if [[ "$backup_output" == *'backup-archive'* ]]; then
  printf 'backup output exposed the dump stream\n' >&2
  exit 1
fi

rm -f "$AWS_ARGS_CAPTURE" "$STAGING_CAPTURE" "$PUBLISHED_CAPTURE" "$PROMOTION_CAPTURE"
output=''
status=0
set +e
output="$(
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/partial.dump \
  COMPOSE_PROJECT_NAME=semcomp-rehearsal-test \
  SIMULATE_PG_DUMP_FAILURE=1 \
  bash "$backup_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'backup must fail when pg_dump fails\n' >&2
  exit 1
fi
if [[ ! -e "$STAGING_CAPTURE" ]]; then
  printf 'backup did not stream the failed archive to a staging object\n' >&2
  exit 1
fi
assert_contains "$(< "$AWS_ARGS_CAPTURE")" 'rm s3://semcomp-test-bucket/backups/.staging/' \
  'backup did not remove the failed staging object'
if [[ -e "$PUBLISHED_CAPTURE" || -e "$PROMOTION_CAPTURE" ]]; then
  printf 'backup published an object after pg_dump failed\n' >&2
  exit 1
fi

rm -f "$AWS_ARGS_CAPTURE" "$STAGING_CAPTURE" "$PUBLISHED_CAPTURE" \
  "$PROMOTION_CAPTURE" "$DOCKER_CALLS_CAPTURE"
output=''
status=0
set +e
output="$(
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/manual/ \
  COMPOSE_PROJECT_NAME=semcomp-rehearsal-test \
  bash "$backup_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'backup must reject a destination key ending in slash\n' >&2
  exit 1
fi
assert_contains "$output" 'BACKUP_KEY must be below the backups/ prefix' \
  'backup trailing-slash validation message was not found'
if [[ -e "$AWS_ARGS_CAPTURE" || -e "$DOCKER_CALLS_CAPTURE" ]]; then
  printf 'backup accessed AWS or Docker before rejecting a destination prefix\n' >&2
  exit 1
fi

rm -f "$EVENTS_CAPTURE"
restore_output="$(
  DEPLOY_ENV=rehearsal \
  CONFIRM_RESTORE=semcomp-rehearsal \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/test.dump \
  POSTGRES_PASSWORD= \
  POSTGRES_DB=semcomp_test \
  POSTGRES_USER=semcomp_test \
  COMPOSE_PROJECT_NAME=semcomp-rehearsal-test \
  TMPDIR="$test_root/tmp" \
  bash "$restore_script"
)"

assert_contains "$(< "$DOCKER_CALLS_CAPTURE")" 'pg_restore --exit-on-error' \
  'restore did not stop on the first PostgreSQL error'
assert_contains "$(< "$DOCKER_CALLS_CAPTURE")" 'pg_restore --exit-on-error --single-transaction' \
  'restore did not make pg_restore transactional'
assert_contains "$(< "$DOCKER_CALLS_CAPTURE")" 'CREATE DATABASE' \
  'restore did not isolate the archive in a fresh database'
assert_contains "$(< "$DOCKER_CALLS_CAPTURE")" 'ALTER DATABASE' \
  'restore did not swap the fresh database into place'
assert_contains "$(< "$PSQL_CALLS_CAPTURE")" 'TEMPLATE template0' \
  'restore did not create the fresh database from template0'
assert_contains "$(< "$PSQL_CALLS_CAPTURE")" 'ALLOW_CONNECTIONS false' \
  'restore did not block new connections before the database swap'
assert_contains "$(< "$RESTORE_CAPTURE")" 'restore-archive' \
  'restore did not stream the downloaded archive to PostgreSQL'
assert_contains "$(< "$CURL_CAPTURE")" 'http://127.0.0.1/api/health' \
  'restore did not validate the rehearsal health endpoint'
if find "$test_root/tmp" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  printf 'restore temporary directory was not cleaned up\n' >&2
  exit 1
fi
if [[ "$restore_output" == *'restore-archive'* ]]; then
  printf 'restore output exposed the dump stream\n' >&2
  exit 1
fi
events="$(< "$EVENTS_CAPTURE")"
assert_order "$events" 'stop-nginx' 'restore' \
  'restore did not stop ingress before loading the archive'
assert_order "$events" 'stop-api' 'restore' \
  'restore did not stop API writers before loading the archive'
assert_order "$events" 'block-target' 'rename-target-to-previous' \
  'restore renamed the target before blocking reconnects'
assert_order "$events" 'restore' 'migrate' \
  'restore did not migrate the restored database'
assert_order "$events" 'migrate' 'start-api' \
  'restore started the API before migrations completed'
assert_order "$events" 'start-nginx' 'health' \
  'restore checked health before restarting ingress'
assert_order "$events" 'health' 'drop-previous' \
  'restore dropped the previous database before validation'

rm -f "$CURL_CAPTURE" "$PSQL_CALLS_CAPTURE" "$DOCKER_CALLS_CAPTURE" "$EVENTS_CAPTURE"
output=''
status=0
set +e
output="$(
  DEPLOY_ENV=rehearsal \
  CONFIRM_RESTORE=semcomp-rehearsal \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/test.dump \
  POSTGRES_PASSWORD= \
  POSTGRES_DB=semcomp_test \
  POSTGRES_USER=semcomp_test \
  COMPOSE_PROJECT_NAME=semcomp-rehearsal-test \
  TMPDIR="$test_root/tmp" \
  HEALTHCHECK_TIMEOUT_SECONDS=08 \
  bash "$restore_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -ne 0 ]]; then
  printf 'restore must accept a decimal health timeout with leading zeros\n' >&2
  exit 1
fi
timeout_events="$(< "$EVENTS_CAPTURE")"
if [[ "$timeout_events" != *'health'* ]]; then
  printf '%s\n' "$output" >&2
  printf 'restore did not check health with a decimal timeout containing leading zeros\n' >&2
  exit 1
fi

rm -f "$CURL_CAPTURE" "$PSQL_CALLS_CAPTURE" "$EVENTS_CAPTURE"
output=''
status=0
set +e
output="$(
  DEPLOY_ENV=rehearsal \
  CONFIRM_RESTORE=semcomp-rehearsal \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/test.dump \
  POSTGRES_PASSWORD= \
  POSTGRES_DB=semcomp_test \
  POSTGRES_USER=semcomp_test \
  COMPOSE_PROJECT_NAME=semcomp-rehearsal-test \
  TMPDIR="$test_root/tmp" \
  SIMULATE_PG_RESTORE_FAILURE=1 \
  bash "$restore_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'restore must fail when pg_restore fails\n' >&2
  exit 1
fi
if [[ -e "$CURL_CAPTURE" ]]; then
  printf 'restore checked health after a failed restore\n' >&2
  exit 1
fi
psql_calls="$(< "$PSQL_CALLS_CAPTURE")"
assert_contains "$psql_calls" 'DROP DATABASE IF EXISTS' \
  'restore did not clean up the temporary database after failure'
if [[ "$psql_calls" == *'ALTER DATABASE :"target_db" RENAME TO :"previous_db"'* ]]; then
  printf 'restore swapped the current database before pg_restore succeeded\n' >&2
  exit 1
fi
failure_events="$(< "$EVENTS_CAPTURE")"
assert_contains "$failure_events" 'start-api' \
  'restore did not restart the API after pg_restore failed'
assert_contains "$failure_events" 'start-web' \
  'restore did not restart the web service after pg_restore failed'
assert_contains "$failure_events" 'start-nginx' \
  'restore did not restart ingress after pg_restore failed'

rm -f "$CURL_CAPTURE" "$PSQL_CALLS_CAPTURE" "$DOCKER_CALLS_CAPTURE" "$EVENTS_CAPTURE"
output=''
status=0
set +e
output="$(
  DEPLOY_ENV=rehearsal \
  CONFIRM_RESTORE=semcomp-rehearsal \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/test.dump \
  POSTGRES_PASSWORD= \
  POSTGRES_DB=semcomp_test \
  POSTGRES_USER=semcomp_test \
  COMPOSE_PROJECT_NAME=semcomp-rehearsal-test \
  TMPDIR="$test_root/tmp" \
  SIMULATE_SWAP_RENAME_FAILURE=1 \
  SIMULATE_SWAP_COMPENSATION_FAILURE=1 \
  bash "$restore_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'restore must fail when the database swap and its compensation fail\n' >&2
  exit 1
fi
if [[ "$status" -ne 47 ]]; then
  printf 'restore must preserve the original database swap failure status\n' >&2
  exit 1
fi
swap_compensation_failure_events="$(< "$EVENTS_CAPTURE")"
assert_order "$swap_compensation_failure_events" 'rename-restore-to-target' 'rollback' \
  'restore did not attempt to restore the original database name after swap failure'
assert_not_contains "$swap_compensation_failure_events" 'start-api' \
  'restore restarted the API after swap compensation failed'
assert_not_contains "$swap_compensation_failure_events" 'start-web' \
  'restore restarted the web service after swap compensation failed'
assert_not_contains "$swap_compensation_failure_events" 'start-nginx' \
  'restore restarted ingress after swap compensation failed'
assert_contains "$output" 'failed to restore the original database name after swap failure' \
  'restore did not report that the swap compensation failed'

rm -f "$CURL_CAPTURE" "$PSQL_CALLS_CAPTURE" "$DOCKER_CALLS_CAPTURE" "$EVENTS_CAPTURE"
output=''
status=0
set +e
output="$(
  DEPLOY_ENV=rehearsal \
  CONFIRM_RESTORE=semcomp-rehearsal \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/test.dump \
  POSTGRES_PASSWORD= \
  POSTGRES_DB=semcomp_test \
  POSTGRES_USER=semcomp_test \
  COMPOSE_PROJECT_NAME=semcomp-rehearsal-test \
  TMPDIR="$test_root/tmp" \
  SIMULATE_TARGET_RENAME_FAILURE=1 \
  SIMULATE_SWAP_ALLOW_FAILURE=1 \
  bash "$restore_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'restore must fail when it cannot re-enable the original database\n' >&2
  exit 1
fi
if [[ "$status" -ne 50 ]]; then
  printf 'restore must preserve the original target rename failure status\n' >&2
  exit 1
fi
swap_allow_failure_events="$(< "$EVENTS_CAPTURE")"
assert_order "$swap_allow_failure_events" 'rename-target-to-previous' 'allow-target' \
  'restore did not try to re-enable the original database after swap failure'
assert_not_contains "$swap_allow_failure_events" 'start-api' \
  'restore restarted the API after database re-enable failed'
assert_not_contains "$swap_allow_failure_events" 'start-web' \
  'restore restarted the web service after database re-enable failed'
assert_not_contains "$swap_allow_failure_events" 'start-nginx' \
  'restore restarted ingress after database re-enable failed'
assert_contains "$output" 'failed to re-enable the original database after swap failure' \
  'restore did not report that re-enabling the original database failed'

rm -f "$CURL_CAPTURE" "$PSQL_CALLS_CAPTURE" "$DOCKER_CALLS_CAPTURE" "$EVENTS_CAPTURE"
output=''
status=0
set +e
output="$(
  DEPLOY_ENV=rehearsal \
  CONFIRM_RESTORE=semcomp-rehearsal \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/test.dump \
  POSTGRES_PASSWORD= \
  POSTGRES_DB=semcomp_test \
  POSTGRES_USER=semcomp_test \
  COMPOSE_PROJECT_NAME=semcomp-rehearsal-test \
  TMPDIR="$test_root/tmp" \
  SIMULATE_MIGRATION_FAILURE=1 \
  bash "$restore_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'restore must fail when the migration fails\n' >&2
  exit 1
fi
if [[ -e "$CURL_CAPTURE" ]]; then
  printf 'restore checked health after a failed migration\n' >&2
  exit 1
fi
migration_failure_events="$(< "$EVENTS_CAPTURE")"
assert_contains "$migration_failure_events" 'rollback' \
  'restore did not roll back the database after migration failed'
assert_order "$migration_failure_events" 'migrate' 'rollback' \
  'restore rolled back before observing migration failure'
assert_order "$migration_failure_events" 'rollback' 'start-api' \
  'restore restarted the API before rolling back the failed database'
assert_not_contains "$migration_failure_events" 'drop-previous' \
  'restore removed the previous database after migration failed'

rm -f "$CURL_CAPTURE" "$PSQL_CALLS_CAPTURE" "$DOCKER_CALLS_CAPTURE" "$EVENTS_CAPTURE"
output=''
status=0
set +e
output="$(
  DEPLOY_ENV=rehearsal \
  CONFIRM_RESTORE=semcomp-rehearsal \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/test.dump \
  POSTGRES_PASSWORD= \
  POSTGRES_DB=semcomp_test \
  POSTGRES_USER=semcomp_test \
  COMPOSE_PROJECT_NAME=semcomp-rehearsal-test \
  TMPDIR="$test_root/tmp" \
  SIMULATE_WEB_START_FAILURE=1 \
  bash "$restore_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'restore must fail when application startup is partial\n' >&2
  exit 1
fi
if [[ -e "$CURL_CAPTURE" ]]; then
  printf 'restore checked health after partial application startup\n' >&2
  exit 1
fi
partial_start_events="$(< "$EVENTS_CAPTURE")"
assert_order "$partial_start_events" 'start-api' 'stop-api' \
  'restore did not stop the partially started API before rollback'
assert_order "$partial_start_events" 'start-nginx' 'stop-nginx' \
  'restore did not stop partially started ingress before rollback'
assert_order "$partial_start_events" 'stop-api' 'rollback' \
  'restore rolled back before stopping the partially started API'
assert_not_contains "$partial_start_events" 'drop-previous' \
  'restore removed the previous database after partial application startup'

rm -f "$CURL_CAPTURE" "$PSQL_CALLS_CAPTURE" "$DOCKER_CALLS_CAPTURE" "$EVENTS_CAPTURE"
output=''
status=0
set +e
output="$(
  DEPLOY_ENV=rehearsal \
  CONFIRM_RESTORE=semcomp-rehearsal \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/test.dump \
  POSTGRES_PASSWORD= \
  POSTGRES_DB=semcomp_test \
  POSTGRES_USER=semcomp_test \
  COMPOSE_PROJECT_NAME=semcomp-rehearsal-test \
  TMPDIR="$test_root/tmp" \
  SIMULATE_MIGRATION_FAILURE=1 \
  SIMULATE_ROLLBACK_RENAME_FAILURE=1 \
  bash "$restore_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'restore must preserve failure when rollback also fails\n' >&2
  exit 1
fi
rollback_failure_events="$(< "$EVENTS_CAPTURE")"
assert_order "$rollback_failure_events" 'rename-target-to-failed' 'allow-target' \
  'rollback did not re-enable the current database after rename failed'
assert_not_contains "$rollback_failure_events" 'start-api' \
  'restore restarted the API after rollback failed'
assert_not_contains "$rollback_failure_events" 'start-web' \
  'restore restarted the web service after rollback failed'
assert_not_contains "$rollback_failure_events" 'start-nginx' \
  'restore restarted ingress after rollback failed'

rm -f "$CURL_CAPTURE" "$PSQL_CALLS_CAPTURE" "$DOCKER_CALLS_CAPTURE" "$EVENTS_CAPTURE"
output=''
status=0
set +e
output="$(
  DEPLOY_ENV=rehearsal \
  CONFIRM_RESTORE=semcomp-rehearsal \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/test.dump \
  POSTGRES_PASSWORD= \
  POSTGRES_DB=semcomp_test \
  POSTGRES_USER=semcomp_test \
  COMPOSE_PROJECT_NAME=semcomp-rehearsal-test \
  TMPDIR="$test_root/tmp" \
  HEALTHCHECK_TIMEOUT_SECONDS=0 \
  SIMULATE_HEALTH_FAILURE=1 \
  bash "$restore_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'restore must fail when the health check fails\n' >&2
  exit 1
fi
health_failure_events="$(< "$EVENTS_CAPTURE")"
assert_order "$health_failure_events" 'start-nginx' 'health' \
  'restore checked health before restarting ingress'
assert_order "$health_failure_events" 'health' 'rollback' \
  'restore did not roll back after health validation failed'
assert_order "$health_failure_events" 'rollback' 'start-api' \
  'restore did not restart the API after health rollback'
assert_not_contains "$health_failure_events" 'drop-previous' \
  'restore removed the previous database after health validation failed'

rm -f "$AWS_ARGS_CAPTURE" "$DOCKER_CALLS_CAPTURE"
output=''
status=0
set +e
output="$(
  DEPLOY_ENV=rehearsal \
  CONFIRM_RESTORE=semcomp-rehearsal \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_S3_URI=s3://different-bucket/backups/test.dump \
  PATH="$bin_dir:$PATH" \
  bash "$restore_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'restore must reject a backup outside the configured bucket\n' >&2
  exit 1
fi
assert_contains "$output" 'configured rehearsal backups/' \
  'restore source isolation message was not found'
if [[ -e "$AWS_ARGS_CAPTURE" || -e "$DOCKER_CALLS_CAPTURE" ]]; then
  printf 'restore accessed AWS or Docker before validating its source\n' >&2
  exit 1
fi

output=''
status=0
set +e
output="$(
  DEPLOY_ENV=rehearsal \
  CONFIRM_RESTORE=semcomp-rehearsal \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/../outside.dump \
  COMPOSE_PROJECT_NAME=semcomp-rehearsal-test \
  PATH="$bin_dir:$PATH" \
  bash "$restore_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'restore must reject an ambiguous backup key\n' >&2
  exit 1
fi
assert_contains "$output" 'configured rehearsal backups/' \
  'restore path traversal message was not found'

output=''
status=0
set +e
output="$(
  DEPLOY_ENV=rehearsal \
  CONFIRM_RESTORE=semcomp-rehearsal \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_S3_URI=s3://semcomp-test-bucket/backups/.staging/partial.dump \
  COMPOSE_PROJECT_NAME=semcomp-rehearsal-test \
  PATH="$bin_dir:$PATH" \
  bash "$restore_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'restore must reject a staging archive\n' >&2
  exit 1
fi
assert_contains "$output" 'configured rehearsal backups/' \
  'restore staging-source message was not found'

output=''
status=0
set +e
output="$(
  DEPLOY_ENV=rehearsal \
  CONFIRM_RESTORE=semcomp-rehearsal \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/test.dump \
  COMPOSE_PROJECT_NAME=not-rehearsal-production \
  PATH="$bin_dir:$PATH" \
  bash "$restore_script" 2>&1
)"
status=$?
set -e

if [[ "$status" -eq 0 ]]; then
  printf 'restore must reject a non-rehearsal Compose project\n' >&2
  exit 1
fi
assert_contains "$output" 'COMPOSE_PROJECT_NAME must identify' \
  'restore project gate message was not found'

printf 'backup stream, restore safety, cleanup and health check: ok\n'
