#!/usr/bin/env bash

set -euo pipefail

# The systemd timer invokes this production-only script without a shell env.
deploy_environment="${DEPLOY_ENV:-production}"
current_link="${CURRENT_LINK:-/opt/semcomp/current}"
shared_dir="${SHARED_DIR:-/opt/semcomp/shared}"
environment_file="${ENV_FILE:-$shared_dir/production.env}"
compose_project_name="${COMPOSE_PROJECT_NAME:-semcomp-production}"

fail() {
  printf '%s\n' "$1" >&2
  exit 64
}

[[ "$deploy_environment" == 'production' ]] || fail 'DEPLOY_ENV must be production.'
(( $# <= 1 )) || fail 'renew-certificate.sh accepts only --dry-run.'
case "${1:-}" in
  '') certbot_arguments=(renew) ;;
  --dry-run) certbot_arguments=(renew --dry-run) ;;
  *) fail 'renew-certificate.sh accepts only --dry-run.' ;;
esac

command -v docker >/dev/null 2>&1 || fail 'Docker is required on the production host.'

current_release="$(readlink -f -- "$current_link" 2>/dev/null)" \
  || fail 'Unable to resolve the current production release.'
production_dir="$current_release/deploy/aws/production"
compose_file="$production_dir/compose.yml"
[[ -d "$current_release" ]] || fail 'The current production release directory is missing.'
[[ -f "$compose_file" ]] || fail 'Production Compose file is missing.'
[[ -f "$environment_file" ]] || fail 'Production environment file is missing.'

compose() {
  docker compose \
    --project-directory "$production_dir" \
    --project-name "$compose_project_name" \
    --file "$compose_file" \
    --env-file "$environment_file" \
    "$@"
}

compose --profile operations run --rm --no-deps certbot "${certbot_arguments[@]}" >/dev/null \
  || fail 'Certbot renewal failed.'
compose exec -T nginx nginx -t >/dev/null \
  || fail 'Nginx validation failed after certificate renewal.'
compose exec -T nginx nginx -s reload >/dev/null \
  || fail 'Nginx reload failed after certificate renewal.'

printf 'certificate renewal completed\n'
