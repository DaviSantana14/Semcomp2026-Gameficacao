#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
backup_script="$script_dir/backup-postgres.sh"
verify_script="$script_dir/verify-backup.sh"
compose_file="$script_dir/../backup-verify.compose.yml"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local message="$3"
  [[ "$haystack" == *"$needle"* ]] || fail "$message"
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  local message="$3"
  [[ "$haystack" != *"$needle"* ]] || fail "$message"
}

for required_file in "$backup_script" "$verify_script" "$compose_file"; do
  [[ -f "$required_file" ]] || fail "missing task 6 artifact: $required_file"
done

test_root="$(mktemp -d "/tmp/semcomp-backup-test.XXXXXXXX")"
trap 'rm -rf -- "$test_root"' EXIT

bin_dir="$test_root/bin"
mkdir -p "$bin_dir" "$test_root/tmp"

cat > "$bin_dir/aws" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
args="$*"
printf '%s\n' "$args" >> "$AWS_CALLS"
case "$args" in
  *'s3 cp - '*'.staging/'*)
    printf 'backup-archive\n' > "$STAGING_OBJECT"
    ;;
  *'s3 cp '*'.staging/'*'backups/production/'*)
    [[ -f "$STAGING_OBJECT" ]] || exit 21
    cp -- "$STAGING_OBJECT" "$PUBLISHED_OBJECT"
    printf 'promote\n' >> "$EVENTS"
    ;;
  *'s3 rm '*'.staging/'*)
    rm -f -- "$STAGING_OBJECT"
    printf 'remove-staging\n' >> "$EVENTS"
    ;;
  's3 cp s3://'*)
    printf 'backup-archive\n' > "$4"
    printf 'download\n' >> "$EVENTS"
    ;;
esac
EOF

cat > "$bin_dir/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
args="$*"
printf '%s\n' "$args" >> "$DOCKER_CALLS"

if [[ "$args" == *'pg_dump -Fc'* ]]; then
  printf 'pg_dump -Fc\n' >> "$EVENTS"
  if [[ "$SIMULATE_PG_DUMP_FAILURE" == '1' ]]; then
    printf 'partial-archive\n'
    exit 42
  fi
  printf 'backup-archive\n'
  exit 0
fi
if [[ "$args" == *'up -d postgres'* ]]; then
  printf 'compose-up\n' >> "$EVENTS"
fi
if [[ "$args" == *'pg_isready'* ]]; then
  printf 'postgres-ready\n' >> "$EVENTS"
fi
if [[ "$args" == *'pg_restore --exit-on-error'* ]]; then
  printf 'pg_restore\n' >> "$EVENTS"
  cat > "$RESTORE_CAPTURE"
  if [[ "$SIMULATE_RESTORE_FAILURE" == '1' ]]; then exit 43; fi
fi
if [[ "$args" == *'prisma migrate status'* ]]; then
  printf 'prisma migrate status\n' >> "$EVENTS"
  if [[ "$SIMULATE_MIGRATE_FAILURE" == '1' ]]; then exit 44; fi
fi
if [[ "$args" == *'FROM "User"'* || "$args" == *'"UserSession"'* ]]; then
  printf 'count-query\n' >> "$EVENTS"
  printf '3|2|1|4|5\n'
fi
if [[ "$args" == *' down '* || "$args" == *' down --'* ]]; then
  printf 'compose-down %s\n' "$args" >> "$EVENTS"
fi
EOF

chmod +x "$bin_dir/aws" "$bin_dir/docker"
export PATH="$bin_dir:$PATH"
export AWS_CALLS="$test_root/aws.calls"
export DOCKER_CALLS="$test_root/docker.calls"
export EVENTS="$test_root/events"
export STAGING_OBJECT="$test_root/staging.dump"
export PUBLISHED_OBJECT="$test_root/published.dump"
export DOWNLOAD_TARGET="$test_root/download.dump"
export RESTORE_CAPTURE="$test_root/restore.dump"
export SIMULATE_PG_DUMP_FAILURE=0
export SIMULATE_RESTORE_FAILURE=0
export SIMULATE_MIGRATE_FAILURE=0
: > "$AWS_CALLS"
: > "$DOCKER_CALLS"
: > "$EVENTS"

production_api_image='123456789012.dkr.ecr.sa-east-1.amazonaws.com/semcomp-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

backup_output="$(
  AWS_REGION=sa-east-1 \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/production/test.dump \
  COMPOSE_PROJECT_NAME=semcomp-production \
  COMPOSE_ENV_FILE="$test_root/production.env" \
  bash "$backup_script"
)"

assert_contains "$( <"$DOCKER_CALLS" )" 'pg_dump -Fc' 'backup did not request PostgreSQL custom format'
assert_contains "$( <"$AWS_CALLS" )" 'backups/.staging/' 'backup did not publish to a staging prefix first'
assert_contains "$( <"$AWS_CALLS" )" 'backups/production/test.dump' 'backup did not promote to the production backup prefix'
assert_contains "$( <"$AWS_CALLS" )" '--sse AES256' 'backup did not request SSE-S3'
assert_contains "$( <"$EVENTS" )" 'promote' 'backup did not promote the successful staging object'
[[ -s "$PUBLISHED_OBJECT" ]] || fail 'backup did not create the promoted final object'
assert_contains "$backup_output" 's3://semcomp-test-bucket/backups/production/test.dump' 'backup did not report the final URI'
assert_not_contains "$backup_output" 'backup-archive' 'backup output exposed dump contents'

rm -f -- "$AWS_CALLS" "$DOCKER_CALLS" "$EVENTS" "$STAGING_OBJECT" "$PUBLISHED_OBJECT"
: > "$AWS_CALLS"
: > "$DOCKER_CALLS"
: > "$EVENTS"
output=''
status=0
set +e
export SIMULATE_PG_DUMP_FAILURE=1
output="$(
  DEPLOY_ENV=production \
  AWS_REGION=sa-east-1 \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_KEY=backups/production/failed.dump \
  COMPOSE_PROJECT_NAME=semcomp-production \
  bash "$backup_script" 2>&1
)"
status=$?
export SIMULATE_PG_DUMP_FAILURE=0
set -e

[[ "$status" -ne 0 ]] || fail 'backup succeeded after pg_dump failed'
assert_contains "$( <"$AWS_CALLS" )" 'rm s3://semcomp-test-bucket/backups/.staging/' 'failed backup did not remove its staging object'
assert_not_contains "$( <"$AWS_CALLS" )" 'backups/production/failed.dump' 'failed backup promoted a final object'
[[ ! -e "$PUBLISHED_OBJECT" ]] || fail 'failed backup left a final object behind'
assert_not_contains "$output" 'backup-archive' 'failed backup exposed dump contents'

printf 'COMPOSE_PROJECT_NAME=semcomp-production\n' > "$test_root/production.env"
printf 'API_IMAGE=%s\n' "$production_api_image" >> "$test_root/production.env"
printf 'BACKUP_BUCKET=semcomp-test-bucket\n' >> "$test_root/production.env"

: > "$AWS_CALLS"
: > "$DOCKER_CALLS"
: > "$EVENTS"
verify_output="$(
  DEPLOY_ENV=production \
  AWS_REGION=sa-east-1 \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_S3_URI=s3://semcomp-test-bucket/backups/production/test.dump \
  RELEASE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  ENV_FILE="$test_root/production.env" \
  TMPDIR="$test_root/tmp" \
  DOWNLOAD_TARGET="$test_root/download.dump" \
  bash "$verify_script"
)"

verify_calls="$( <"$DOCKER_CALLS" )"
assert_contains "$verify_calls" 'semcomp-backup-verify-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' 'restore did not use the release-scoped Compose project'
assert_contains "$( <"$compose_file" )" 'tmpfs:' 'verification Compose file did not make PostgreSQL disposable'
assert_contains "$( <"$compose_file" )" 'pg_isready -U "$${POSTGRES_USER}" -d "$${POSTGRES_DB}"' 'verification healthcheck referenced unavailable environment variables'
assert_not_contains "$( <"$compose_file" )" 'postgres_data' 'verification Compose file mounted the production PostgreSQL volume'
assert_contains "$verify_calls" 'pg_restore --exit-on-error --single-transaction --no-owner --no-privileges' 'restore did not use the required pg_restore safety flags'
assert_contains "$verify_calls" 'prisma migrate status' 'restore did not run Prisma migration status'
assert_contains "$verify_calls" 'down' 'restore did not clean up its Compose project'
assert_not_contains "$verify_calls" 'semcomp-production down' 'restore cleanup targeted the production Compose project'
assert_contains "$( <"$RESTORE_CAPTURE" )" 'backup-archive' 'restore did not stream the downloaded archive into pg_restore'
if find "$test_root/tmp" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  fail 'restore temporary directory was not cleaned up'
fi
assert_contains "$verify_output" 'User=3' 'restore did not report the User aggregate count'
assert_contains "$verify_output" 'ClaimCode=5' 'restore did not report the ClaimCode aggregate count'

: > "$DOCKER_CALLS"
for invalid_uri in \
  's3://different-bucket/backups/production/test.dump' \
  's3://semcomp-test-bucket/backups/.staging/test.dump' \
  's3://semcomp-test-bucket/backups/production/../test.dump'; do
  set +e
  output="$(
    DEPLOY_ENV=production \
    AWS_REGION=sa-east-1 \
    BACKUP_BUCKET=semcomp-test-bucket \
    BACKUP_S3_URI="$invalid_uri" \
    RELEASE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
    ENV_FILE="$test_root/production.env" \
    bash "$verify_script" 2>&1
  )"
  status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "restore accepted invalid backup URI: $invalid_uri"
  assert_not_contains "$( <"$DOCKER_CALLS" )" 'up -d postgres' 'restore started Docker before validating its backup URI'
done

: > "$DOCKER_CALLS"
set +e
export SIMULATE_MIGRATE_FAILURE=1
output="$(
  DEPLOY_ENV=production \
  AWS_REGION=sa-east-1 \
  BACKUP_BUCKET=semcomp-test-bucket \
  BACKUP_S3_URI=s3://semcomp-test-bucket/backups/production/test.dump \
  RELEASE_SHA=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  ENV_FILE="$test_root/production.env" \
  TMPDIR="$test_root/tmp" \
  bash "$verify_script" 2>&1
)"
status=$?
export SIMULATE_MIGRATE_FAILURE=0
set -e

[[ "$status" -ne 0 ]] || fail 'restore succeeded after Prisma migration status failed'
assert_contains "$( <"$DOCKER_CALLS" )" 'down' 'restore did not clean up the disposable project after a verification failure'
assert_not_contains "$( <"$DOCKER_CALLS" )" 'semcomp-production down' 'failure cleanup targeted the production Compose project'

script_source="$(<"$verify_script")"
assert_not_contains "$script_source" 'DROP DATABASE' 'restore verification contains destructive database commands'
assert_not_contains "$script_source" 'ALTER DATABASE' 'restore verification contains database rename commands'
assert_not_contains "$script_source" 'docker compose down -v semcomp-production' 'restore verification contains an unsafe production cleanup command'

printf 'backup stream, isolated restore, validation and cleanup: ok\n'
