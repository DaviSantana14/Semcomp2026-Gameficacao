#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/../../.." && pwd)"
compose_dir="$project_dir/deploy/aws"
compose_file="$compose_dir/compose.yml"
env_file="${ENV_FILE:-/opt/semcomp/shared/rehearsal.env}"
compose_project_name="${COMPOSE_PROJECT_NAME:-semcomp-rehearsal}"

[[ -f "$compose_file" ]] || {
  printf 'Arquivo Compose não encontrado: %s\n' "$compose_file" >&2
  exit 1
}

[[ -f "$env_file" ]] || {
  printf 'Arquivo de ambiente não encontrado: %s\n' "$env_file" >&2
  exit 1
}

read -r -p 'CPF do administrador: ' cpf
read -r -p 'E-mail do administrador: ' email
read -r -s -p 'Nova senha administrativa: ' password
printf '\n'
read -r -s -p 'Confirme a nova senha: ' confirmation
printf '\n'

trap 'unset password confirmation' EXIT

printf '%s\n%s\n%s\n%s\n' "$cpf" "$email" "$password" "$confirmation" |
  docker compose \
    --project-directory "$compose_dir" \
    --project-name "$compose_project_name" \
    --file "$compose_file" \
    --env-file "$env_file" \
    run --rm --no-deps -T api \
    npm --workspace api run set-admin-password
