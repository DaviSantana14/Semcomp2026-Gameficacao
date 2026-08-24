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

# The systemd timer invokes this production-only script without a shell env.
deploy_environment="${DEPLOY_ENV:-production}"
[[ "$deploy_environment" == 'production' ]] || fail 'DEPLOY_ENV must be production'

aws_region="${AWS_REGION:-sa-east-1}"
[[ "$aws_region" == 'sa-east-1' ]] || fail 'AWS_REGION must be sa-east-1'

command -v aws >/dev/null 2>&1 || fail 'AWS CLI is required'
command -v docker >/dev/null 2>&1 || fail 'Docker is required'

configured_region="$(aws configure get region 2>/dev/null || true)"
if [[ -n "$configured_region" && "$configured_region" != 'sa-east-1' ]]; then
  fail 'configured AWS region must be sa-east-1'
fi

script_dir="$(cd -- "$(dirname -- "$0")" && pwd)"
release_root="$(cd -- "$script_dir/../../../.." && pwd)"
compose_dir="$release_root/deploy/aws/production"
compose_file="$compose_dir/compose.yml"
[[ -f "$compose_file" ]] || fail 'production Compose file is missing'

shared_dir="${SHARED_DIR:-/opt/semcomp/shared}"
compose_env_file="${COMPOSE_ENV_FILE:-${ENV_FILE:-$shared_dir/production.env}}"

backup_bucket="${BACKUP_BUCKET:-}"
if [[ -z "$backup_bucket" ]]; then
  backup_bucket="$(read_env_value BACKUP_BUCKET "$compose_env_file")"
fi
[[ -n "$backup_bucket" ]] || fail 'BACKUP_BUCKET is required'
validate_bucket "$backup_bucket"

compose_project_name="${COMPOSE_PROJECT_NAME:-semcomp-production}"
[[ "$compose_project_name" == 'semcomp-production' ]] || fail 'COMPOSE_PROJECT_NAME must be semcomp-production'
backup_key="${BACKUP_KEY:-backups/production/semcomp-$(date -u +%Y%m%dT%H%M%SZ).dump}"
if [[ "$backup_key" != backups/production/* || "$backup_key" == */ || "$backup_key" == *'..'* || "$backup_key" == *$'\n'* ]]; then
  fail 'BACKUP_KEY must be below backups/production/'
fi

compose_args=(--project-directory "$compose_dir" --project-name "$compose_project_name" --file "$compose_file")
if [[ -f "$compose_env_file" ]]; then
  compose_args+=(--env-file "$compose_env_file")
fi

s3_uri="s3://$backup_bucket/$backup_key"
staging_key="backups/.staging/semcomp-production-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
staging_uri="s3://$backup_bucket/$staging_key"
staging_created=1

cleanup() {
  local status="$?"
  trap - EXIT
  if (( status != 0 && staging_created == 1 )); then
    aws s3 rm "$staging_uri" --region "$aws_region" --only-show-errors >/dev/null 2>&1 || true
  fi
  exit "$status"
}
trap cleanup EXIT

set -o pipefail
docker compose "${compose_args[@]}" exec -T postgres sh -c 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | aws s3 cp - "$staging_uri" --region "$aws_region" --sse AES256 --only-show-errors >/dev/null

aws s3 cp "$staging_uri" "$s3_uri" --region "$aws_region" --sse AES256 --only-show-errors >/dev/null
aws s3 rm "$staging_uri" --region "$aws_region" --only-show-errors >/dev/null
staging_created=0

printf '%s\n' "$s3_uri"
