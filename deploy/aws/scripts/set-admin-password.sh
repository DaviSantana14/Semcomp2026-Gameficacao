#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_dir="$(cd -- "$script_dir/../../.." && pwd)"

read -r -p 'CPF do administrador: ' cpf
read -r -p 'E-mail do administrador: ' email
read -r -s -p 'Nova senha administrativa: ' password
printf '\n'
read -r -s -p 'Confirme a nova senha: ' confirmation
printf '\n'

trap 'unset password confirmation' EXIT

printf '%s\n%s\n%s\n%s\n' "$cpf" "$email" "$password" "$confirmation" |
  npm --prefix "$project_dir" --workspace api run set-admin-password
