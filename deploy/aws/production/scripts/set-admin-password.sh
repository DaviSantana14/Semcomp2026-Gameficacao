#!/usr/bin/env bash

set -euo pipefail

deploy_environment="${DEPLOY_ENV:-}"
base_url="${BASE_URL:-https://gameficacao.semcomp.com.br}"
confirmation="${CONFIRM_ADMIN_PASSWORD:-}"
current_link="${CURRENT_LINK:-/opt/semcomp/current}"
environment_file="${ENV_FILE:-/opt/semcomp/shared/production.env}"
compose_project_name="${COMPOSE_PROJECT_NAME:-semcomp-production}"

fail() {
  printf '%s\n' "$1" >&2
  exit 64
}

[[ "$deploy_environment" == 'production' ]] || fail 'DEPLOY_ENV must be production.'
[[ "$confirmation" == 'semcomp-production' ]] || fail 'CONFIRM_ADMIN_PASSWORD must equal semcomp-production.'
[[ "$base_url" == 'https://gameficacao.semcomp.com.br' ]] || fail 'administrative password changes require the production HTTPS URL.'
command -v curl >/dev/null 2>&1 || fail 'curl is required before changing the administrator password.'
command -v docker >/dev/null 2>&1 || fail 'Docker is required to change the administrator password.'
[[ -L "$current_link" ]] || fail 'the production current release is not active.'
[[ -f "$environment_file" ]] || fail 'the production environment file is missing.'

health_url="${base_url%/}/api/health"
curl --fail --silent --show-error --connect-timeout 3 --max-time 10 \
  "$health_url" >/dev/null \
  || fail 'HTTPS production health check did not pass.'

current_release="$(readlink -f -- "$current_link")" || fail 'unable to resolve the current release.'
compose_file="$current_release/deploy/aws/production/compose.yml"
[[ -f "$compose_file" ]] || fail 'production Compose file is missing.'
[[ "$compose_project_name" == 'semcomp-production' ]] || fail 'the production Compose project name is fixed.'

read -r -p 'CPF do administrador: ' admin_cpf
read -r -p 'E-mail do administrador: ' admin_email
read -r -s -p 'Nova senha administrativa: ' new_password
printf '\n'
read -r -s -p 'Confirme a nova senha: ' new_password_confirmation
printf '\n'
trap 'unset new_password new_password_confirmation' EXIT

{
  printf '%s\n' "$admin_cpf"
  printf '%s\n' "$admin_email"
  printf '%s\n' "$new_password"
  printf '%s\n' "$new_password_confirmation"
} | docker compose \
  --project-directory "$current_release/deploy/aws/production" \
  --project-name "$compose_project_name" \
  --file "$compose_file" \
  --env-file "$environment_file" \
  run --rm --no-deps -T api \
  npm --workspace api run set-admin-password
