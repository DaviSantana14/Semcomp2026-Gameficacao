#!/usr/bin/env bash

set -euo pipefail

domain='gameficacao.semcomp.com.br'
deploy_environment="${DEPLOY_ENV:-}"
current_link="${CURRENT_LINK:-/opt/semcomp/current}"
shared_dir="${SHARED_DIR:-/opt/semcomp/shared}"
environment_file="${ENV_FILE:-$shared_dir/production.env}"
compose_project_name="${COMPOSE_PROJECT_NAME:-semcomp-production}"
production_elastic_ip="${PRODUCTION_ELASTIC_IP:-}"

fail() {
  printf '%s\n' "$1" >&2
  exit 64
}

[[ "$deploy_environment" == 'production' ]] || fail 'DEPLOY_ENV must be production.'
[[ "$production_elastic_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] \
  || fail 'PRODUCTION_ELASTIC_IP must be an IPv4 address.'

IFS='.' read -r octet_one octet_two octet_three octet_four <<<"$production_elastic_ip"
for octet in "$octet_one" "$octet_two" "$octet_three" "$octet_four"; do
  (( 10#$octet <= 255 )) || fail 'PRODUCTION_ELASTIC_IP contains an invalid octet.'
done

command -v dig >/dev/null 2>&1 || fail 'dig is required to validate the production DNS record.'
command -v docker >/dev/null 2>&1 || fail 'Docker is required on the production host.'

if ! IFS= read -r -p 'ACME email: ' acme_email; then
  fail 'ACME email is required.'
fi
acme_email_pattern='^[[:alnum:]._%+-]+@[[:alnum:]]([[:alnum:]-]*[[:alnum:]])?(\.[[:alnum:]]([[:alnum:]-]*[[:alnum:]])?)*\.[[:alpha:]]{2,63}$'
[[ "$acme_email" =~ $acme_email_pattern ]] \
  || fail 'ACME email is invalid.'
(( ${#acme_email} <= 254 )) || fail 'ACME email is too long.'

dns_records="$(dig +short A "$domain" 2>/dev/null)" \
  || fail 'Unable to resolve the production DNS record.'
[[ "$dns_records" == "$production_elastic_ip" ]] \
  || fail "DNS A record for $domain does not match ProductionElasticIp."

current_release="$(readlink -f -- "$current_link" 2>/dev/null)" \
  || fail 'Unable to resolve the current production release.'
production_dir="$current_release/deploy/aws/production"
compose_file="$production_dir/compose.yml"
maintenance_config="$production_dir/nginx-maintenance.conf"
active_config="$shared_dir/nginx/active.conf"

[[ -d "$current_release" ]] || fail 'The current production release directory is missing.'
[[ -f "$compose_file" ]] || fail 'Production Compose file is missing.'
[[ -f "$maintenance_config" ]] || fail 'Production maintenance Nginx config is missing.'
[[ -f "$environment_file" ]] || fail 'Production environment file is missing.'

compose() {
  docker compose \
    --project-directory "$production_dir" \
    --project-name "$compose_project_name" \
    --file "$compose_file" \
    --env-file "$environment_file" \
    "$@"
}

install -d -m 0750 "$shared_dir/nginx"
temporary_config="$(mktemp "$shared_dir/nginx/.active.conf.XXXXXXXX")"
cleanup() {
  local status=$?
  set +e
  if [[ -n "${temporary_config:-}" && -f "$temporary_config" ]]; then
    rm -f -- "$temporary_config"
  fi
  exit "$status"
}
trap cleanup EXIT

install -m 0644 "$maintenance_config" "$temporary_config"
mv -f -- "$temporary_config" "$active_config"
temporary_config=''

compose up -d --no-deps --no-build --force-recreate nginx >/dev/null \
  || fail 'Unable to keep the maintenance Nginx active.'

compose --profile operations run --rm --no-deps certbot \
  certonly \
  --webroot \
  -w /var/www/certbot \
  -d "$domain" \
  --cert-name "$domain" \
  -n \
  --agree-tos \
  --no-eff-email \
  --email "$acme_email" \
  >/dev/null \
  || fail 'Certbot could not issue the production certificate.'

printf 'certificate request completed for %s\n' "$domain"
