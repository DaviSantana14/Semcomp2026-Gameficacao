#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/../../.." && pwd)"

: "${BACKUP_BUCKET:?BACKUP_BUCKET is required}"

compose_file="$project_dir/deploy/aws/compose.yml"
compose_project_name="${COMPOSE_PROJECT_NAME:-semcomp-rehearsal}"
compose_env_file="${COMPOSE_ENV_FILE:-}"
postgres_service='postgres'
aws_region="${AWS_REGION:-sa-east-1}"
backup_key="${BACKUP_KEY:-backups/semcomp-$(date -u +%Y%m%dT%H%M%SZ).dump}"

if [[ "$backup_key" != backups/* || "$backup_key" == */ || "$backup_key" == *'..'* || "$backup_key" == backups/.staging/* ]]; then
  printf 'BACKUP_KEY must be below the backups/ prefix\n' >&2
  exit 64
fi

case "$compose_project_name" in
  semcomp-rehearsal|semcomp-rehearsal-*) ;;
  *)
    printf 'COMPOSE_PROJECT_NAME must identify the rehearsal environment\n' >&2
    exit 64
    ;;
esac

compose_args=(
  --project-directory "$project_dir"
  --project-name "$compose_project_name"
  --file "$compose_file"
)
if [[ -n "$compose_env_file" ]]; then
  compose_args+=(--env-file "$compose_env_file")
fi

s3_uri="s3://${BACKUP_BUCKET}/${backup_key}"
staging_key="backups/.staging/semcomp-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
staging_uri="s3://${BACKUP_BUCKET}/${staging_key}"
staging_created=1

cleanup() {
  local status=$?

  if [[ "$status" -ne 0 && "$staging_created" -eq 1 ]]; then
    aws s3 rm "$staging_uri" --region "$aws_region" --only-show-errors \
      > /dev/null 2>&1 || true
  fi

  exit "$status"
}
trap cleanup EXIT

set -o pipefail
docker compose "${compose_args[@]}" exec -T "$postgres_service" sh -c \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' |
  aws s3 cp - "$staging_uri" --region "$aws_region" --sse AES256 --only-show-errors

aws s3 cp "$staging_uri" "$s3_uri" --region "$aws_region" --sse AES256 \
  --only-show-errors
aws s3 rm "$staging_uri" --region "$aws_region" --only-show-errors
staging_created=0

printf 'backup uploaded to %s\n' "$s3_uri"
