#!/usr/bin/env bash

set -euo pipefail

required_region='sa-east-1'
aws_region="${AWS_REGION:-}"
expected_account="${EXPECTED_AWS_ACCOUNT_ID:-}"
deploy_environment="${DEPLOY_ENV:-}"
release_sha="${RELEASE_SHA:-}"
release_bucket="${RELEASE_BUCKET:-}"
releases_dir="${RELEASES_DIR:-/opt/semcomp/releases}"
current_link="${CURRENT_LINK:-/opt/semcomp/current}"
shared_dir="${SHARED_DIR:-/opt/semcomp/shared}"
environment_file="${ENV_FILE:-$shared_dir/production.env}"
manifest_file="${MANIFEST_FILE:-}"
healthcheck_url="${HEALTHCHECK_URL:-http://127.0.0.1/api/health}"
healthcheck_timeout="${HEALTHCHECK_TIMEOUT_SECONDS:-120}"
switch_completed=0
candidate_env=''
environment_backup=''
parameter_dump=''

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

validate_bucket() {
  [[ "$1" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]] || fail 'invalid production bucket name'
}

validate_image() {
  local value="$1"
  local repository="$2"
  [[ "$value" =~ ^[0-9]{12}\.dkr\.ecr\.sa-east-1\.amazonaws\.com/$repository@sha256:[0-9a-f]{64}$ ]] \
    || fail "manifest image for $repository is not an immutable ECR reference"
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
if [[ -z "$release_bucket" ]]; then
  fail 'RELEASE_BUCKET is required.'
fi
validate_bucket "$release_bucket"

command -v aws >/dev/null 2>&1 || fail 'AWS CLI is required on the production host.'
command -v docker >/dev/null 2>&1 || fail 'Docker is required on the production host.'
command -v curl >/dev/null 2>&1 || fail 'curl is required on the production host.'
command -v systemctl >/dev/null 2>&1 || fail 'systemctl is required on the production host.'

configured_region="$(aws configure get region 2>/dev/null || true)"
if [[ -n "$configured_region" && "$configured_region" != "$required_region" ]]; then
  fail "Configured AWS region must be $required_region."
fi
actual_account="$(aws sts get-caller-identity --query Account --output text --region "$aws_region" 2>/dev/null)" \
  || fail 'Unable to validate the AWS account.'
[[ "$actual_account" == "$expected_account" ]] || fail 'AWS account validation failed.'

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
release_root="$(cd -- "$script_dir/../../../.." && pwd)"
release_dir="$releases_dir/$release_sha"
releases_root="$(cd -- "$releases_dir" 2>/dev/null && pwd)" || fail 'release directory does not exist.'
release_dir_absolute="$(cd -- "$release_dir" 2>/dev/null && pwd)" || fail 'release directory is missing.'
[[ "$release_root" == "$release_dir_absolute" ]] || fail 'deploy must run from its extracted release directory.'
compose_file="$release_root/deploy/aws/production/compose.yml"
[[ -f "$compose_file" ]] || fail 'production Compose file is missing.'
maintenance_nginx_config="$release_root/deploy/aws/production/nginx-maintenance.conf"
[[ -f "$maintenance_nginx_config" ]] || fail 'production maintenance Nginx configuration is missing.'

if [[ -e "$current_link" && ! -L "$current_link" ]]; then
  fail 'current must be a symbolic link when it exists.'
fi

previous_release=''
if [[ -L "$current_link" ]]; then
  previous_release="$(readlink -f -- "$current_link")" || fail 'unable to resolve current release.'
  case "$previous_release" in
    "$releases_root"/*) ;;
    *) fail 'current points outside the production releases directory.' ;;
  esac
  [[ "${previous_release##*/}" =~ ^[0-9a-f]{40}$ ]] || fail 'current release name is not a commit SHA.'
fi

if [[ -z "$manifest_file" ]]; then
  manifest_file="$release_root/manifest.json"
  aws s3 cp "s3://$release_bucket/releases/$release_sha/manifest.json" "$manifest_file" \
    --region "$aws_region" --only-show-errors >/dev/null \
    || fail 'unable to download the production release manifest.'
fi
[[ -f "$manifest_file" ]] || fail 'production release manifest is missing.'
manifest_real="$(readlink -f -- "$manifest_file")" || fail 'unable to resolve production release manifest.'
case "$manifest_real" in
  "$release_root"/*) ;;
  *) fail 'manifest must be inside the extracted release directory.' ;;
esac

manifest_release_sha="$(json_field releaseSha "$manifest_file")"
manifest_bucket="$(json_field bucket "$manifest_file")"
api_image="$(json_field apiImage "$manifest_file")"
web_image="$(json_field webImage "$manifest_file")"
[[ "$manifest_release_sha" == "$release_sha" ]] || fail 'manifest SHA does not match RELEASE_SHA.'
[[ "$manifest_bucket" == "$release_bucket" ]] || fail 'manifest bucket does not match the production stack bucket.'
validate_image "$api_image" 'semcomp-production/api'
validate_image "$web_image" 'semcomp-production/web'
api_registry="${api_image%%/*}"
web_registry="${web_image%%/*}"
[[ "$api_registry" == "$web_registry" ]] || fail 'manifest images must use the same ECR registry'
aws ecr get-login-password --region "$aws_region" \
  | docker login --username AWS --password-stdin "$api_registry" >/dev/null 2>&1 \
  || fail 'Unable to authenticate Docker to the production ECR registry.'

umask 077
install -d -m 0750 "$shared_dir"
install -d -m 0750 "$shared_dir/nginx"
active_nginx_config="$shared_dir/nginx/active.conf"
if [[ -e "$active_nginx_config" || -L "$active_nginx_config" ]]; then
  [[ -f "$active_nginx_config" && ! -L "$active_nginx_config" ]] \
    || fail 'active Nginx configuration must be a regular file.'
else
  install -m 0644 "$maintenance_nginx_config" "$active_nginx_config"
fi
candidate_env="$(mktemp "$shared_dir/.production.env.XXXXXXXX")"
cleanup() {
  local status=$?
  set +e

  if [[ "$status" -ne 0 && "$switch_completed" -eq 0 ]]; then
    if [[ -n "$environment_backup" && -f "$environment_backup" ]]; then
      mv -f -- "$environment_backup" "$environment_file"
      environment_backup=''
    fi

    if [[ -n "$previous_release" && -d "$previous_release" && -f "$environment_file" ]]; then
      compose_for_release "$previous_release" "$environment_file" up -d >/dev/null 2>&1 || \
        printf 'production release failed and the previous release could not be restarted\n' >&2
    else
      compose_for_release "$release_root" "$candidate_env" down --remove-orphans >/dev/null 2>&1 || true
    fi
  fi

  if [[ -n "$candidate_env" && -f "$candidate_env" ]]; then
    rm -f -- "$candidate_env"
  fi
  if [[ -n "$environment_backup" && -f "$environment_backup" ]]; then
    rm -f -- "$environment_backup"
  fi
  unset parameter_dump
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

declare -A seen_parameters=()
declare -A parameter_values=()
required_parameters=(
  POSTGRES_DB
  POSTGRES_USER
  POSTGRES_PASSWORD
  POSTGRES_SCHEMA
  JWT_SECRET
  RATE_LIMIT_KEY_SECRET
  FRONTEND_URL
  COOKIE_SAME_SITE
  COOKIE_SECURE
  NODE_ENV
  SWAGGER_ENABLED
  SEED_MODE
  SEED_ADMIN_NAME
  SEED_ADMIN_CPF
  SEED_ADMIN_EMAIL
  COMPOSE_PROJECT_NAME
)

parameter_dump="$(aws ssm get-parameters-by-path \
  --path /semcomp/production/ \
  --recursive \
  --with-decryption \
  --query 'Parameters[].[Name,Value]' \
  --output text \
  --region "$aws_region" 2>/dev/null)" \
  || fail 'Unable to read production parameters from SSM.'

while IFS=$'\t' read -r parameter_name parameter_value extra; do
  [[ -z "${parameter_name:-}" ]] && continue
  parameter_key="${parameter_name##*/}"

  [[ "$parameter_name" == "/semcomp/production/$parameter_key" ]] \
    || fail 'SSM returned a parameter outside the production path.'
  [[ -z "${extra:-}" ]] || fail 'SSM returned a parameter value with extra fields.'
  [[ "$parameter_value" != *$'\n'* && "$parameter_value" != *$'\r'* && "$parameter_value" != *"'"* ]] \
    || fail 'SSM parameter values must be single-line values without quotes.'
  [[ -n "$parameter_value" ]] || fail 'A required production parameter is empty.'

  case "$parameter_key" in
    POSTGRES_DB|POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_SCHEMA|JWT_SECRET|RATE_LIMIT_KEY_SECRET|FRONTEND_URL|COOKIE_SAME_SITE|COOKIE_SECURE|NODE_ENV|SWAGGER_ENABLED|SEED_MODE|SEED_ADMIN_NAME|SEED_ADMIN_CPF|SEED_ADMIN_EMAIL|COMPOSE_PROJECT_NAME)
      parameter_values["$parameter_key"]="$parameter_value"
      seen_parameters["$parameter_key"]=1
      ;;
    *)
      fail 'Unexpected production parameter returned by SSM.'
      ;;
  esac
done <<< "$parameter_dump"
unset parameter_dump

for parameter_key in "${required_parameters[@]}"; do
  [[ -n "${seen_parameters[$parameter_key]+x}" ]] || fail "Required production parameter is missing: $parameter_key"
done
[[ "${parameter_values[SEED_MODE]}" == 'admin-only' ]] || fail 'SEED_MODE must be admin-only.'
compose_project_name="${parameter_values[COMPOSE_PROJECT_NAME]}"
[[ "$compose_project_name" =~ ^[a-z0-9][a-z0-9_-]+$ ]] || fail 'Invalid production Compose project name.'

{
  printf 'API_IMAGE=%s\n' "$api_image"
  printf 'WEB_IMAGE=%s\n' "$web_image"
  for parameter_key in "${required_parameters[@]}"; do
    printf '%s=%s\n' "$parameter_key" "${parameter_values[$parameter_key]}"
  done
  printf 'BACKUP_BUCKET=%s\n' "$manifest_bucket"
  printf 'NGINX_CONFIG_FILE=/opt/semcomp/shared/nginx/active.conf\n'
} > "$candidate_env"
chmod 0600 "$candidate_env"

if ! compose_for_release "$release_root" "$candidate_env" config --quiet >/dev/null 2>&1; then
  fail 'Production Compose configuration validation failed.'
fi
if ! compose_for_release "$release_root" "$candidate_env" up -d postgres migrate >/dev/null 2>&1; then
  fail 'Production PostgreSQL or prisma migrate deploy failed.'
fi
if ! compose_for_release "$release_root" "$candidate_env" up -d api web nginx >/dev/null 2>&1; then
  fail 'Production application startup failed.'
fi
if [[ -z "$previous_release" ]]; then
  if ! compose_for_release "$release_root" "$candidate_env" --profile operations run --rm --no-deps seed >/dev/null 2>&1; then
    fail 'Initial admin-only seed failed.'
  fi
fi

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

wait_for_health || fail 'Production local health check failed.'

if ! systemctl enable --now semcomp-certbot-renew.timer semcomp-backup.timer >/dev/null 2>&1; then
  fail 'Could not enable production maintenance timers.'
fi

if [[ -f "$environment_file" ]]; then
  environment_backup="$(mktemp "$shared_dir/.production.env.previous.XXXXXXXX")"
  cp -- "$environment_file" "$environment_backup"
  chmod 0600 "$environment_backup"
fi
mv -f -- "$candidate_env" "$environment_file"
candidate_env=''

temporary_link="$current_link.tmp.$$"
if [[ -e "$temporary_link" || -L "$temporary_link" ]]; then
  fail 'temporary current symlink already exists.'
fi
ln -s -- "$release_dir" "$temporary_link"
mv -Tf -- "$temporary_link" "$current_link"
switch_completed=1

printf 'production release %s is current\n' "$release_sha"
