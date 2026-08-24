#!/usr/bin/env bash

set -euo pipefail

domain='gameficacao.semcomp.com.br'
deploy_environment="${DEPLOY_ENV:-}"
edge_mode="${EDGE_MODE:-}"
current_link="${CURRENT_LINK:-/opt/semcomp/current}"
shared_dir="${SHARED_DIR:-/opt/semcomp/shared}"
environment_file="${ENV_FILE:-$shared_dir/production.env}"
compose_project_name="${COMPOSE_PROJECT_NAME:-semcomp-production}"
smoke_test_script="${SMOKE_TEST_SCRIPT:-}"
edge_url="${EDGE_URL:-https://$domain/}"

fail() {
  printf '%s\n' "$1" >&2
  exit 64
}

[[ "$deploy_environment" == 'production' ]] || fail 'DEPLOY_ENV must be production.'
case "$edge_mode" in
  report-only|enforcement) ;;
  *) fail 'EDGE_MODE must be report-only or enforcement.' ;;
esac
if [[ "$edge_mode" == 'enforcement' && "${SEMCOMP_CSP_ENFORCEMENT:-}" != 'approved' ]]; then
  fail 'SEMCOMP_CSP_ENFORCEMENT=approved is required for CSP enforcement.'
fi

command -v docker >/dev/null 2>&1 || fail 'Docker is required on the production host.'
command -v curl >/dev/null 2>&1 || fail 'curl is required to confirm the public edge headers.'

current_release="$(readlink -f -- "$current_link" 2>/dev/null)" \
  || fail 'Unable to resolve the current production release.'
production_dir="$current_release/deploy/aws/production"
compose_file="$production_dir/compose.yml"
maintenance_config="$production_dir/nginx-maintenance.conf"
report_only_config="$production_dir/nginx-report-only.conf"
production_config="$production_dir/nginx-production.conf"
active_config="$shared_dir/nginx/active.conf"

[[ -d "$current_release" ]] || fail 'The current production release directory is missing.'
[[ -f "$compose_file" ]] || fail 'Production Compose file is missing.'
[[ -f "$maintenance_config" ]] || fail 'Production maintenance Nginx config is missing.'
[[ -f "$report_only_config" ]] || fail 'Production report-only Nginx config is missing.'
[[ -f "$production_config" ]] || fail 'Production enforcement Nginx config is missing.'
[[ -f "$environment_file" ]] || fail 'Production environment file is missing.'
[[ -f "$active_config" ]] || fail 'Active Nginx config is missing.'

if [[ "$edge_mode" == 'report-only' ]]; then
  cmp -s -- "$active_config" "$maintenance_config" \
    || fail 'Report-only activation requires maintenance mode to be active.'
  [[ -n "$smoke_test_script" ]] \
    || smoke_test_script="$current_release/deploy/aws/production/scripts/smoke-test.sh"
  [[ -f "$smoke_test_script" ]] || fail 'Browser smoke test script is missing.'
else
  cmp -s -- "$active_config" "$report_only_config" \
    || fail 'CSP enforcement requires report-only mode to be active.'
fi

compose() {
  docker compose \
    --project-directory "$production_dir" \
    --project-name "$compose_project_name" \
    --file "$compose_file" \
    --env-file "$environment_file" \
    "$@"
}

for certificate_file in \
  /etc/letsencrypt/live/$domain/fullchain.pem \
  /etc/letsencrypt/live/$domain/privkey.pem; do
  compose exec -T nginx test -s "$certificate_file" >/dev/null \
    || fail 'Certificate files must exist before activating the edge.'
done

install -d -m 0750 "$shared_dir/nginx"
previous_config="$(mktemp "$shared_dir/nginx/.active.conf.previous.XXXXXXXX")"
install -m 0644 "$active_config" "$previous_config"
active_changed=0

activate_config() {
  local source_config="$1"
  local temporary_config
  temporary_config="$(mktemp "$shared_dir/nginx/.active.conf.XXXXXXXX")"
  install -m 0644 "$source_config" "$temporary_config"
  mv -f -- "$temporary_config" "$active_config"
}

restore_previous_config() {
  local temporary_config
  temporary_config="$(mktemp "$shared_dir/nginx/.active.conf.XXXXXXXX")"
  install -m 0644 "$previous_config" "$temporary_config"
  mv -f -- "$temporary_config" "$active_config"
}

cleanup() {
  local status=$?
  set +e

  if [[ "$status" -ne 0 && "$active_changed" -eq 1 ]]; then
    restore_previous_config
    compose up -d --no-deps --no-build --force-recreate nginx >/dev/null 2>&1 || true
  fi

  if [[ -n "${previous_config:-}" && -f "$previous_config" ]]; then
    rm -f -- "$previous_config"
  fi
  exit "$status"
}
trap cleanup EXIT

if [[ "$edge_mode" == 'report-only' ]]; then
  activate_config "$report_only_config"
  active_changed=1

  compose exec -T nginx nginx -t >/dev/null \
    || fail 'Nginx validation failed for report-only configuration.'
  compose up -d --no-deps --no-build --force-recreate nginx >/dev/null \
    || fail 'Unable to recreate the report-only Nginx edge.'
  SMOKE_SCOPE=edge CSP_EXPECTED_MODE=report-only bash "$smoke_test_script" \
    || fail 'Browser smoke test failed in report-only mode.'

  active_changed=0
  printf 'edge activated in report-only mode\n'
else
  activate_config "$production_config"
  active_changed=1

  compose exec -T nginx nginx -t >/dev/null \
    || fail 'Nginx validation failed for enforcement configuration.'
  compose exec -T nginx nginx -s reload >/dev/null \
    || fail 'Nginx reload failed for enforcement configuration.'

  headers="$(curl --fail --silent --show-error --head "$edge_url" 2>/dev/null)" \
    || fail 'Unable to confirm the public edge response after enforcement.'
  grep -Eiq '^Content-Security-Policy:' <<<"$headers" \
    || fail 'CSP enforcement header is missing from the public edge response.'
  ! grep -Eiq '^Content-Security-Policy-Report-Only:' <<<"$headers" \
    || fail 'Public edge response still exposes report-only CSP.'

  active_changed=0
  printf 'edge activated with CSP enforcement\n'
fi
