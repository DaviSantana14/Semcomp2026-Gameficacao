#!/usr/bin/env bash

set -euo pipefail

fail() {
  printf '%s\n' "$1" >&2
  exit 64
}

read_env_value() {
  local name="$1"
  local file="$2"
  [[ -f "$file" ]] || return 0
  awk -F= -v wanted="$name" '$1 == wanted { sub(/^[^=]*=/, ""); print; exit }' "$file"
}

validate_bucket() {
  [[ "$1" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || fail 'BACKUP_BUCKET is not a valid S3 bucket name'
}

validate_source() {
  local prefix="s3://$backup_bucket/backups/production/"
  if [[ "$backup_s3_uri" != "$prefix"* || "$backup_s3_uri" == "$prefix" || "$backup_s3_uri" == */ || "$backup_s3_uri" == *'..'* || "$backup_s3_uri" == *'backups/.staging/'* || "$backup_s3_uri" == *$'\n'* ]]; then
    fail 'backup source must be below the configured production backups/ prefix'
  fi
}

deploy_environment="${DEPLOY_ENV:-}"
[[ "$deploy_environment" == 'production' ]] || fail 'DEPLOY_ENV must be production'

aws_region="${AWS_REGION:-sa-east-1}"
[[ "$aws_region" == 'sa-east-1' ]] || fail 'AWS_REGION must be sa-east-1'

release_sha="${RELEASE_SHA:-}"
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || fail 'RELEASE_SHA must be a full 40-character commit SHA'

command -v aws >/dev/null 2>&1 || fail 'AWS CLI is required'
command -v docker >/dev/null 2>&1 || fail 'Docker is required'

configured_region="$(aws configure get region 2>/dev/null || true)"
if [[ -n "$configured_region" && "$configured_region" != 'sa-east-1' ]]; then
  fail 'configured AWS region must be sa-east-1'
fi

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
release_root="$(cd -- "$script_dir/../../../.." && pwd)"
compose_dir="$release_root/deploy/aws/production"
compose_file="$compose_dir/backup-verify.compose.yml"
[[ -f "$compose_file" ]] || fail 'backup verification Compose file is missing'

shared_dir="${SHARED_DIR:-/opt/semcomp/shared}"
environment_file="${ENV_FILE:-$shared_dir/production.env}"

backup_bucket="${BACKUP_BUCKET:-}"
if [[ -z "$backup_bucket" ]]; then
  backup_bucket="$(read_env_value BACKUP_BUCKET "$environment_file")"
fi
[[ -n "$backup_bucket" ]] || fail 'BACKUP_BUCKET is required'
validate_bucket "$backup_bucket"

backup_s3_uri="${BACKUP_S3_URI:-}"
backup_key="${BACKUP_KEY:-}"
if [[ -n "$backup_s3_uri" && -n "$backup_key" ]]; then
  fail 'set only one of BACKUP_S3_URI or BACKUP_KEY'
fi
if [[ -z "$backup_s3_uri" ]]; then
  [[ -n "$backup_key" ]] || fail 'BACKUP_S3_URI or BACKUP_KEY is required'
  backup_s3_uri="s3://$backup_bucket/$backup_key"
fi
validate_source

api_image="${API_IMAGE:-}"
if [[ -z "$api_image" ]]; then
  api_image="$(read_env_value API_IMAGE "$environment_file")"
fi
[[ -n "$api_image" ]] || fail 'API_IMAGE is required for restore verification'
[[ "$api_image" != *$'\n'* && "$api_image" != *$'\r'* ]] || fail 'API_IMAGE must be a single-line value'

project_name="semcomp-backup-verify-$release_sha"
[[ "$project_name" =~ ^semcomp-backup-verify-[0-9a-f]{40}$ ]] || fail 'invalid disposable Compose project name'

umask 077
restore_dir="$(mktemp -d "${TMPDIR:-/tmp}/semcomp-backup-verify.XXXXXXXX")"
restore_dump="$restore_dir/database.dump"
compose_env_file="$restore_dir/compose.env"
verify_db='semcomp_backup_verify'
verify_user='semcomp_backup_verify'
verify_password="$(od -An -N 24 -tx1 /dev/urandom | tr -d ' \n')"

{
  printf 'API_IMAGE=%s\n' "$api_image"
  printf 'VERIFY_POSTGRES_DB=%s\n' "$verify_db"
  printf 'VERIFY_POSTGRES_USER=%s\n' "$verify_user"
  printf 'VERIFY_POSTGRES_PASSWORD=%s\n' "$verify_password"
} > "$compose_env_file"
chmod 600 "$compose_env_file"

compose_args=(--project-directory "$compose_dir" --project-name "$project_name" --file "$compose_file" --env-file "$compose_env_file")

compose() {
  docker compose "${compose_args[@]}" "$@"
}

compose_started=0
cleanup() {
  local status="$?"
  local cleanup_status=0

  trap - EXIT
  set +e
  if (( compose_started == 1 )); then
    compose down --volumes --remove-orphans >/dev/null 2>&1
    cleanup_status="$?"
  fi
  rm -rf -- "$restore_dir"
  if (( status == 0 && cleanup_status != 0 )); then
    status="$cleanup_status"
  fi
  exit "$status"
}
trap cleanup EXIT

aws s3 cp "$backup_s3_uri" "$restore_dump" --region "$aws_region" --only-show-errors >/dev/null
[[ -s "$restore_dump" ]] || fail 'downloaded backup archive is empty'

compose_started=1
compose up -d postgres >/dev/null

ready=0
for attempt in $(seq 1 30); do
  if compose exec -T postgres pg_isready -U "$verify_user" -d "$verify_db" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
(( ready == 1 )) || fail 'disposable PostgreSQL did not become ready'

compose exec -T postgres pg_restore --exit-on-error --single-transaction --no-owner --no-privileges -U "$verify_user" -d "$verify_db" < "$restore_dump" >/dev/null

compose run --rm --no-deps api npm --workspace api exec -- prisma migrate status >/dev/null

count_query="SELECT (SELECT count(*)::text FROM \"User\") || '|' || (SELECT count(*)::text FROM \"UserSession\") || '|' || (SELECT count(*)::text FROM \"Action\") || '|' || (SELECT count(*)::text FROM \"Reward\") || '|' || (SELECT count(*)::text FROM \"ClaimCode\");"
counts="$(compose exec -T postgres psql -v ON_ERROR_STOP=1 -At -U "$verify_user" -d "$verify_db" -c "$count_query")"
if [[ ! "$counts" =~ ^[0-9]+\|[0-9]+\|[0-9]+\|[0-9]+\|[0-9]+$ ]]; then
  fail 'restore count query returned an invalid aggregate result'
fi
IFS='|' read -r user_count session_count action_count reward_count claim_code_count <<< "$counts"
printf 'restore counts: User=%s UserSession=%s Action=%s Reward=%s ClaimCode=%s\n' "$user_count" "$session_count" "$action_count" "$reward_count" "$claim_code_count"
