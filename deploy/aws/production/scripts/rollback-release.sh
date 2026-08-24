#!/usr/bin/env bash

set -euo pipefail

required_region='sa-east-1'
aws_region="${AWS_REGION:-}"
expected_account="${EXPECTED_AWS_ACCOUNT_ID:-}"
deploy_environment="${DEPLOY_ENV:-}"
release_sha="${RELEASE_SHA:-}"
release_bucket="${RELEASE_BUCKET:-${BACKUP_BUCKET:-}}"
releases_dir="${RELEASES_DIR:-/opt/semcomp/releases}"
current_link="${CURRENT_LINK:-/opt/semcomp/current}"
shared_dir="${SHARED_DIR:-/opt/semcomp/shared}"
environment_file="${ENV_FILE:-$shared_dir/production.env}"
healthcheck_url="${HEALTHCHECK_URL:-http://127.0.0.1/api/health}"
healthcheck_timeout="${HEALTHCHECK_TIMEOUT_SECONDS:-120}"
manifest_file=''
rollback_env=''
environment_backup=''
target_download_dir=''
switch_completed=0
rollback_started=0

fail() {
  printf '%s\n' "$1" >&2
  exit 64
}

json_field() {
  local key="$1"
  local file="$2"
  local matches
  matches="$(grep -Eo "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]+\"" "$file" || true)"
  [[ "$(wc -l <<<"$matches" | tr -d ' ')" == '1' ]] || fail "manifest field $key is missing or duplicated"
  sed -E 's/^[^:]+:[[:space:]]*"([^"]+)".*$/\1/' <<<"$matches"
}

optional_json_field() {
  local key="$1"
  local file="$2"
  local matches
  matches="$(grep -Eo "\"$key\"[[:space:]]*:[[:space:]]*\"[^\"]+\"" "$file" || true)"
  [[ "$(wc -l <<<"$matches" | tr -d ' ')" == '1' ]] || return 1
  sed -E 's/^[^:]+:[[:space:]]*"([^"]+)".*$/\1/' <<<"$matches"
}

validate_bucket() {
  [[ "$1" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || fail 'invalid production bucket name'
}

validate_image() {
  local value="$1"
  local repository="$2"
  [[ "$value" =~ ^[0-9]{12}\.dkr\.ecr\.sa-east-1\.amazonaws\.com/$repository@sha256:[0-9a-f]{64}$ ]] \
    || fail "manifest image for $repository is not immutable"
}

if [[ "$aws_region" != "$required_region" ]]; then
  fail "AWS region must be $required_region."
fi
if [[ "$deploy_environment" != 'production' ]]; then
  fail 'DEPLOY_ENV must be production.'
fi
if [[ ! "$expected_account" =~ ^[0-9]{12}$ ]]; then
  fail 'EXPECTED_AWS_ACCOUNT_ID must be a 12-digit AWS account id.'
fi
if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  fail 'RELEASE_SHA must be the full 40-character commit SHA.'
fi
if [[ ! "$healthcheck_timeout" =~ ^[0-9]+$ ]]; then
  fail 'HEALTHCHECK_TIMEOUT_SECONDS must be a non-negative integer.'
fi
healthcheck_timeout=$((10#$healthcheck_timeout))
if (( healthcheck_timeout > 120 )); then
  fail 'HEALTHCHECK_TIMEOUT_SECONDS cannot exceed 120 seconds.'
fi

command -v aws >/dev/null 2>&1 || fail 'AWS CLI is required on the production host.'
command -v docker >/dev/null 2>&1 || fail 'Docker is required on the production host.'
command -v curl >/dev/null 2>&1 || fail 'curl is required on the production host.'

configured_region="$(aws configure get region 2>/dev/null || true)"
if [[ -n "$configured_region" && "$configured_region" != "$required_region" ]]; then
  fail "Configured AWS region must be $required_region."
fi
actual_account="$(aws sts get-caller-identity --query Account --output text --region "$aws_region" 2>/dev/null)" \
  || fail 'Unable to validate the AWS account.'
[[ "$actual_account" == "$expected_account" ]] || fail 'AWS account validation failed.'

[[ -L "$current_link" ]] || fail 'current must be a symbolic link before rollback.'
current_release="$(readlink -f -- "$current_link")" || fail 'unable to resolve current release.'
releases_root="$(cd -- "$releases_dir" 2>/dev/null && pwd)" || fail 'release directory does not exist.'
case "$current_release" in
  "$releases_root"/*) ;;
  *) fail 'current points outside the production releases directory.' ;;
esac
[[ "${current_release##*/}" =~ ^[0-9a-f]{40}$ ]] || fail 'current release name is not a commit SHA.'
[[ -f "$environment_file" ]] || fail 'production environment file is missing.'

configured_bucket="$(sed -n 's/^BACKUP_BUCKET=//p' "$environment_file" | head -n1)"
if [[ -z "$release_bucket" ]]; then
  release_bucket="$configured_bucket"
elif [[ -n "$configured_bucket" && "$configured_bucket" != "$release_bucket" ]]; then
  fail 'RELEASE_BUCKET does not match the stack bucket in the production environment.'
fi
[[ -n "$release_bucket" ]] || fail 'RELEASE_BUCKET or BACKUP_BUCKET is required.'
validate_bucket "$release_bucket"

umask 077
install -d -m 0750 "$shared_dir"
manifest_file="$(mktemp "$shared_dir/.rollback-manifest.XXXXXXXX")"
rollback_env="$(mktemp "$shared_dir/.rollback-env.XXXXXXXX")"

cleanup() {
  local status=$?
  set +e

  if [[ "$status" -ne 0 && "$switch_completed" -eq 0 && -n "$environment_backup" && -f "$environment_backup" ]]; then
    mv -f -- "$environment_backup" "$environment_file"
    environment_backup=''
  fi
  if [[ "$status" -ne 0 && "$switch_completed" -eq 0 && "$rollback_started" -eq 1 && -f "$environment_file" ]]; then
    compose_for_release "$current_release" "$environment_file" up -d >/dev/null 2>&1 || \
      printf 'rollback failed and the current release could not be restarted\n' >&2
  fi
  if [[ -n "$environment_backup" && -f "$environment_backup" ]]; then
    rm -f -- "$environment_backup"
  fi
  if [[ -n "$manifest_file" && -f "$manifest_file" ]]; then
    rm -f -- "$manifest_file"
  fi
  if [[ -n "$rollback_env" && -f "$rollback_env" ]]; then
    rm -f -- "$rollback_env"
  fi
  if [[ -n "$target_download_dir" && -d "$target_download_dir" ]]; then
    rm -rf -- "$target_download_dir"
  fi
  exit "$status"
}
trap cleanup EXIT

compose_project_name='semcomp-production'
compose_for_release() {
  local target_release="$1"
  local target_env="$2"
  shift 2

  docker compose \
    --project-directory "$target_release/deploy/aws/production" \
    --project-name "$compose_project_name" \
    --file "$target_release/deploy/aws/production/compose.yml" \
    --env-file "$target_env" \
    "$@"
}

manifest_key="releases/$release_sha/manifest.json"
aws s3api head-object \
  --bucket "$release_bucket" \
  --key "$manifest_key" \
  --region "$aws_region" >/dev/null 2>&1 \
  || fail 'rollback release manifest is not published in the production bucket.'
aws s3 cp "s3://$release_bucket/$manifest_key" "$manifest_file" \
  --region "$aws_region" --only-show-errors >/dev/null \
  || fail 'unable to download the published rollback manifest.'

manifest_release_sha="$(json_field releaseSha "$manifest_file")"
manifest_bucket="$(json_field bucket "$manifest_file")"
api_image="$(json_field apiImage "$manifest_file")"
web_image="$(json_field webImage "$manifest_file")"
[[ "$manifest_release_sha" == "$release_sha" ]] || fail 'rollback manifest SHA does not match RELEASE_SHA.'
[[ "$manifest_bucket" == "$release_bucket" ]] || fail 'rollback manifest bucket does not match the stack bucket.'
validate_image "$api_image" 'semcomp-production/api'
validate_image "$web_image" 'semcomp-production/web'

target_release="$releases_root/$release_sha"
if [[ ! -d "$target_release" ]]; then
  archive_key="$(optional_json_field archiveKey "$manifest_file" || printf 'releases/%s/release.tar.gz' "$release_sha")"
  [[ "$archive_key" == "releases/$release_sha/"* ]] || fail 'rollback archive is outside the release prefix.'
  archive_file="$(mktemp "$shared_dir/.rollback-archive.XXXXXXXX")"
  target_download_dir="$(mktemp -d "$releases_root/.rollback-release.XXXXXXXX")"
  aws s3 cp "s3://$release_bucket/$archive_key" "$archive_file" \
    --region "$aws_region" --only-show-errors >/dev/null \
    || fail 'published rollback archive is unavailable.'
  tar -xzf "$archive_file" -C "$target_download_dir" \
    || fail 'published rollback archive could not be extracted.'
  rm -f -- "$archive_file"
  [[ -f "$target_download_dir/deploy/aws/production/compose.yml" ]] \
    || fail 'rollback archive does not contain production Compose.'
  mv -- "$target_download_dir" "$target_release"
  target_download_dir=''
fi
[[ -f "$target_release/deploy/aws/production/compose.yml" ]] \
  || fail 'rollback release Compose file is missing.'
[[ "$target_release" != "$current_release" ]] || fail 'requested rollback release is already current.'

awk -F= -v api="$api_image" -v web="$web_image" -v bucket="$release_bucket" '
  BEGIN { seen_api = 0; seen_web = 0; seen_bucket = 0; seen_nginx = 0 }
  $1 == "API_IMAGE" { print "API_IMAGE=" api; seen_api = 1; next }
  $1 == "WEB_IMAGE" { print "WEB_IMAGE=" web; seen_web = 1; next }
  $1 == "BACKUP_BUCKET" { print "BACKUP_BUCKET=" bucket; seen_bucket = 1; next }
  $1 == "NGINX_CONFIG_FILE" { print "NGINX_CONFIG_FILE=/opt/semcomp/shared/nginx/active.conf"; seen_nginx = 1; next }
  { print }
  END {
    if (!seen_api) print "API_IMAGE=" api
    if (!seen_web) print "WEB_IMAGE=" web
    if (!seen_bucket) print "BACKUP_BUCKET=" bucket
    if (!seen_nginx) print "NGINX_CONFIG_FILE=/opt/semcomp/shared/nginx/active.conf"
  }
' "$environment_file" > "$rollback_env"
chmod 0600 "$rollback_env"

backup_script="${BACKUP_SCRIPT:-$current_release/deploy/aws/production/scripts/backup-postgres.sh}"
[[ -f "$backup_script" ]] || fail 'pre-rollback backup script is missing.'
DEPLOY_ENV=production BACKUP_BUCKET="$release_bucket" RELEASE_SHA="$(basename "$current_release")" \
  bash "$backup_script" >/dev/null || fail 'pre-rollback backup failed.'

if ! compose_for_release "$target_release" "$rollback_env" up -d >/dev/null 2>&1; then
  fail 'rollback application startup failed.'
fi
rollback_started=1

wait_for_health() {
  local deadline=$((SECONDS + healthcheck_timeout))
  while true; do
    if curl --fail --silent --show-error --connect-timeout 3 --max-time 5 \
      "$healthcheck_url" >/dev/null 2>&1; then
      return 0
    fi
    if (( SECONDS >= deadline )); then
      return 1
    fi
    sleep 2
  done
}

wait_for_health || fail 'rollback health check failed.'

environment_backup="$(mktemp "$shared_dir/.production.env.previous.XXXXXXXX")"
cp -- "$environment_file" "$environment_backup"
chmod 0600 "$environment_backup"
mv -f -- "$rollback_env" "$environment_file"
rollback_env=''

temporary_link="$current_link.tmp.$$"
if [[ -e "$temporary_link" || -L "$temporary_link" ]]; then
  fail 'temporary current symlink already exists.'
fi
ln -s -- "$target_release" "$temporary_link"
mv -Tf -- "$temporary_link" "$current_link"
switch_completed=1

printf 'production rollback to %s is current\n' "$release_sha"
