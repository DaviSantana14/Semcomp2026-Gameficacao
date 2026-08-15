#!/usr/bin/env bash

set -euo pipefail

required_region='sa-east-1'
aws_region="${AWS_REGION:-${3:-sa-east-1}}"
expected_account="${EXPECTED_AWS_ACCOUNT_ID:-}"
deploy_environment="${DEPLOY_ENV:-}"
release_sha="${RELEASE_SHA:-${1:-}}"
release_bucket="${RELEASE_BUCKET:-${2:-}}"
releases_dir="${RELEASES_DIR:-/opt/semcomp/releases}"
current_link="${CURRENT_LINK:-/opt/semcomp/current}"
shared_dir="${SHARED_DIR:-/opt/semcomp/shared}"
environment_file="${ENV_FILE:-$shared_dir/rehearsal.env}"
compose_project_name="${COMPOSE_PROJECT_NAME:-semcomp-rehearsal}"
healthcheck_url="${HEALTHCHECK_URL:-http://127.0.0.1/api/health}"
healthcheck_timeout="${HEALTHCHECK_TIMEOUT_SECONDS:-120}"

fail() {
  printf '%s\n' "$1" >&2
  exit 64
}

if [[ "$aws_region" != "$required_region" ]]; then
  fail "AWS region must be $required_region."
fi

if [[ "$deploy_environment" != 'rehearsal' ]]; then
  fail 'DEPLOY_ENV must be rehearsal.'
fi

if [[ ! "$expected_account" =~ ^[0-9]{12}$ ]]; then
  fail 'EXPECTED_AWS_ACCOUNT_ID must be a 12-digit AWS account id.'
fi

if [[ ! "$healthcheck_timeout" =~ ^[0-9]+$ ]]; then
  fail 'HEALTHCHECK_TIMEOUT_SECONDS must be a non-negative integer.'
fi
healthcheck_timeout=$((10#$healthcheck_timeout))
if (( healthcheck_timeout > 120 )); then
  fail 'HEALTHCHECK_TIMEOUT_SECONDS cannot exceed 120 seconds.'
fi

if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ ]]; then
  fail 'RELEASE_SHA must be the full 40-character commit SHA.'
fi

if [[ -n "$release_bucket" && ! "$release_bucket" =~ ^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$ ]]; then
  fail 'RELEASE_BUCKET is not a valid rehearsal bucket name.'
fi

command -v aws >/dev/null 2>&1 || fail 'AWS CLI is required on the deployment host.'

configured_region="$(aws configure get region 2>/dev/null || true)"
if [[ -n "$configured_region" && "$configured_region" != "$required_region" ]]; then
  fail "Configured AWS region must be $required_region."
fi

actual_account="$(aws sts get-caller-identity \
  --query Account --output text --region "$aws_region" 2>/dev/null)" \
  || fail 'Unable to validate the AWS account.'
if [[ "$actual_account" != "$expected_account" ]]; then
  fail 'AWS account validation failed.'
fi

command -v docker >/dev/null 2>&1 || fail 'Docker is required on the deployment host.'
command -v curl >/dev/null 2>&1 || fail 'curl is required on the deployment host.'

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
release_root="$(cd -- "$script_dir/../../.." && pwd)"
release_dir="$releases_dir/$release_sha"
compose_file="$release_root/deploy/aws/compose.yml"

if [[ "$release_root" != "$release_dir" ]]; then
  fail 'deploy-release.sh must run from its extracted release directory.'
fi
if [[ ! -f "$compose_file" ]]; then
  fail 'release Compose file is missing.'
fi

if [[ -e "$current_link" && ! -L "$current_link" ]]; then
  fail 'current must be a symbolic link when it exists.'
fi

previous_release=''
if [[ -L "$current_link" ]]; then
  previous_release="$(readlink -f -- "$current_link")" \
    || fail 'unable to resolve the current release.'
  case "$previous_release" in
    "$releases_dir"/*) ;;
    *) fail 'current points outside the rehearsal releases directory.' ;;
  esac
fi

if [[ ! -d "$release_dir" ]]; then
  fail 'extracted release directory is missing.'
fi

umask 077
install -d -m 0750 "$shared_dir"

parameter_dump=''
environment_tmp="$(mktemp "$shared_dir/.rehearsal.env.XXXXXXXX")"
rollback_in_progress=0
switch_completed=0

compose_for_release() {
  local target_release="$1"
  shift

  docker compose \
    --project-directory "$target_release" \
    --project-name "$compose_project_name" \
    --file "$target_release/deploy/aws/compose.yml" \
    --env-file "$environment_file" \
    "$@"
}

cleanup() {
  local status=$?

  set +e
  if [[ "$status" -ne 0 && "$switch_completed" -eq 0 && "$rollback_in_progress" -eq 0 ]]; then
    rollback_in_progress=1
    if [[ -n "$previous_release" && -d "$previous_release" ]]; then
      if ! compose_for_release "$previous_release" up -d --build > /dev/null 2>&1; then
        printf 'release failed and the previous release could not be restarted\n' >&2
      fi
    else
      compose_for_release "$release_root" down --remove-orphans > /dev/null 2>&1 || true
    fi
  fi

  unset parameter_dump
  if [[ -n "$environment_tmp" ]]; then
    rm -f -- "$environment_tmp"
  fi
  exit "$status"
}
trap cleanup EXIT

declare -A seen_parameters=()
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

if ! parameter_dump="$(aws ssm get-parameters-by-path \
  --path /semcomp/rehearsal/ \
  --recursive \
  --with-decryption \
  --query 'Parameters[].[Name,Value]' \
  --output text \
  --region "$aws_region" 2>/dev/null)"; then
  fail 'Unable to read rehearsal parameters from SSM.'
fi

while IFS=$'\t' read -r parameter_name parameter_value extra; do
  [[ -z "${parameter_name:-}" ]] && continue

  parameter_key="${parameter_name##*/}"
  if [[ "$parameter_name" != "/semcomp/rehearsal/$parameter_key" ]]; then
    fail 'SSM returned a parameter outside the rehearsal path.'
  fi
  if [[ -n "${extra:-}" || "$parameter_value" == *$'\n'* || "$parameter_value" == *$'\r'* || "$parameter_value" == *"'"* ]]; then
    fail 'SSM parameter values must be single-line values without quotes.'
  fi

  case "$parameter_key" in
    POSTGRES_DB|POSTGRES_USER|POSTGRES_PASSWORD|POSTGRES_SCHEMA|JWT_SECRET|RATE_LIMIT_KEY_SECRET|FRONTEND_URL|COOKIE_SAME_SITE|COOKIE_SECURE|NODE_ENV|SWAGGER_ENABLED|SEED_MODE|SEED_ADMIN_NAME|SEED_ADMIN_CPF|SEED_ADMIN_EMAIL|COMPOSE_PROJECT_NAME)
      [[ -n "$parameter_value" ]] || fail 'A required rehearsal parameter is empty.'
      printf '%s=%s\n' "$parameter_key" "$parameter_value" >> "$environment_tmp"
      seen_parameters["$parameter_key"]=1
      if [[ "$parameter_key" == 'SEED_MODE' && "$parameter_value" != 'admin-only' ]]; then
        fail 'SEED_MODE must be admin-only for a release deployment.'
      fi
      if [[ "$parameter_key" == 'COMPOSE_PROJECT_NAME' ]]; then
        compose_project_name="$parameter_value"
      fi
      ;;
    *)
      fail 'Unexpected rehearsal parameter returned by SSM.'
      ;;
  esac
done <<< "$parameter_dump"
unset parameter_dump

for parameter_key in "${required_parameters[@]}"; do
  [[ -n "${seen_parameters[$parameter_key]+x}" ]] \
    || fail 'A required rehearsal parameter is missing.'
done

chmod 0600 "$environment_tmp"
mv -f -- "$environment_tmp" "$environment_file"
environment_tmp=''

if ! compose_for_release "$release_root" config > /dev/null 2>&1; then
  fail 'Compose configuration validation failed.'
fi

if ! compose_for_release "$release_root" build > /dev/null 2>&1; then
  fail 'Release image build failed.'
fi

if ! compose_for_release "$release_root" up -d > /dev/null 2>&1; then
  fail 'Release stack startup failed.'
fi

if ! compose_for_release "$release_root" --profile operations run --rm --no-deps seed > /dev/null 2>&1; then
  fail 'admin-only seed failed.'
fi

wait_for_health() {
  local deadline=$((SECONDS + healthcheck_timeout))

  while true; do
    if curl --fail --silent --show-error --connect-timeout 3 --max-time 5 \
      "$healthcheck_url" > /dev/null 2>&1; then
      return 0
    fi
    if (( SECONDS >= deadline )); then
      return 1
    fi
    sleep 2
  done
}

if ! wait_for_health; then
  fail 'release health check failed.'
fi

temporary_link="${current_link}.tmp.$$"
if [[ -e "$temporary_link" || -L "$temporary_link" ]]; then
  fail 'temporary current symlink already exists.'
fi
ln -s -- "$release_dir" "$temporary_link"
mv -Tf -- "$temporary_link" "$current_link"
switch_completed=1

release_candidates=()
while IFS= read -r candidate; do
  release_candidates+=("$candidate")
done < <(
  find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
    | sort -nr
)

previous_kept=0
for candidate_record in "${release_candidates[@]}"; do
  candidate_path="${candidate_record#* }"
  candidate_name="${candidate_path##*/}"
  [[ "$candidate_name" =~ ^[0-9a-f]{40}$ ]] || continue
  [[ "$candidate_path" == "$release_dir" ]] && continue

  if (( previous_kept < 2 )); then
    previous_kept=$((previous_kept + 1))
  else
    rm -rf -- "$candidate_path"
  fi
done

printf 'release %s is current\n' "$release_sha"
