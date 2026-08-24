#!/usr/bin/env bash

set -euo pipefail

domain='gameficacao.semcomp.com.br'
required_url="https://${domain}"
deploy_environment="${DEPLOY_ENV:-}"
base_url="${BASE_URL:-${required_url}}"
expected_ip="${EXPECTED_ELASTIC_IP:-}"
curl_timeout="${SMOKE_CURL_TIMEOUT_SECONDS:-10}"
log_since="${SMOKE_LOG_SINCE:-15m}"
current_link="${CURRENT_LINK:-/opt/semcomp/current}"
shared_dir="${SHARED_DIR:-/opt/semcomp/shared}"
environment_file="${ENV_FILE:-${shared_dir}/production.env}"
compose_project_name="${COMPOSE_PROJECT_NAME:-semcomp-production}"
csp_expected_mode="${CSP_EXPECTED_MODE:-enforcement}"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 64
}

pass() {
  printf 'PASS: %s\n' "$1"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required to run the production smoke test"
}

valid_ipv4() {
  local address="$1"
  local octet
  local -a octets

  IFS='.' read -r -a octets <<< "$address"
  [[ "${#octets[@]}" -eq 4 ]] || return 1
  for octet in "${octets[@]}"; do
    [[ "$octet" =~ ^[0-9]{1,3}$ ]] || return 1
    (( 10#$octet <= 255 )) || return 1
  done
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\r'/\\r}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}

participant_jar=''
participant_response=''
participant_headers=''
admin_jar=''
admin_response=''
admin_headers=''
participant_authenticated=0
admin_authenticated=0
participant_csrf=''
admin_csrf=''
temporary_files=()

register_temp_file() {
  temporary_files+=("$1")
}

logout_session() {
  local cookie_jar="$1"
  local csrf_token="$2"
  local logout_status

  [[ -s "$cookie_jar" && -n "$csrf_token" ]] || return 0
  logout_status="$(curl --silent --show-error --request POST --output /dev/null \
    --write-out '%{http_code}' --max-time "$curl_timeout" --cookie "$cookie_jar" \
    --header "X-CSRF-Token: $csrf_token" "$base_url/api/auth/logout" 2>/dev/null)" \
    || return 1
  [[ "$logout_status" == '204' ]]
}

cleanup() {
  local status="$?"
  set +e
  if (( participant_authenticated == 1 )); then
    logout_session "$participant_jar" "$participant_csrf" >/dev/null 2>&1 || true
  fi
  if (( admin_authenticated == 1 )); then
    logout_session "$admin_jar" "$admin_csrf" >/dev/null 2>&1 || true
  fi
  for temporary_file in "${temporary_files[@]}"; do
    [[ -n "$temporary_file" && -e "$temporary_file" ]] && rm -f -- "$temporary_file"
  done
  exit "$status"
}
trap cleanup EXIT

[[ "$deploy_environment" == 'production' ]] || fail 'DEPLOY_ENV must be production.'
[[ "$base_url" == "$required_url" ]] || fail 'BASE_URL must be exactly https://gameficacao.semcomp.com.br.'
valid_ipv4 "$expected_ip" || fail 'EXPECTED_ELASTIC_IP must be a valid IPv4 address.'
[[ "$compose_project_name" == 'semcomp-production' ]] || fail 'COMPOSE_PROJECT_NAME must be semcomp-production.'
[[ "$csp_expected_mode" == 'report-only' || "$csp_expected_mode" == 'enforcement' ]] \
  || fail 'CSP_EXPECTED_MODE must be report-only or enforcement.'
[[ "$curl_timeout" =~ ^[0-9]+$ ]] || fail 'SMOKE_CURL_TIMEOUT_SECONDS must be a non-negative integer.'
(( 10#$curl_timeout > 0 && 10#$curl_timeout <= 60 )) || fail 'SMOKE_CURL_TIMEOUT_SECONDS must be between 1 and 60.'

for command_name in curl dig openssl nc docker mktemp readlink grep sed head; do
  require_command "$command_name"
done

mapfile -t dns_records < <(dig +short A "$domain" | sed '/^[[:space:]]*$/d')
[[ "${#dns_records[@]}" -eq 1 ]] || fail 'DNS A record did not resolve to exactly one address.'
resolved_ip="${dns_records[0]//[[:space:]]/}"
[[ "$resolved_ip" == "$expected_ip" ]] || fail 'DNS A record does not match the expected Elastic IP.'
pass 'DNS A record'

redirect_headers_file="$(mktemp "${TMPDIR:-/tmp}/semcomp-smoke-http.XXXXXXXX")"
register_temp_file "$redirect_headers_file"
http_status="$(curl --silent --show-error --output /dev/null --dump-header "$redirect_headers_file" \
  --write-out '%{http_code}' --max-time "$curl_timeout" "http://$domain/")" \
  || fail 'HTTP redirect request failed.'
[[ "$http_status" == '301' || "$http_status" == '308' ]] \
  || fail 'HTTP must return 301 or 308 before reaching the application.'
redirect_location="$(sed -n 's/^[Ll]ocation:[[:space:]]*//p' "$redirect_headers_file" | head -n1)"
redirect_location="${redirect_location%$'\r'}"
[[ "$redirect_location" == "${required_url}/" ]] \
  || fail 'HTTP redirect does not target the exact HTTPS production URL.'

acme_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --max-time "$curl_timeout" "http://$domain/.well-known/acme-challenge/semcomp-smoke")" \
  || fail 'ACME challenge request failed.'
[[ "$acme_status" != '301' && "$acme_status" != '308' ]] \
  || fail 'ACME challenge requests must bypass the HTTPS redirect.'
pass 'HTTP redirects to HTTPS and ACME remains reachable'

certificate_file="$(mktemp "${TMPDIR:-/tmp}/semcomp-smoke-certificate.XXXXXXXX")"
register_temp_file "$certificate_file"
if ! openssl s_client -connect "$domain:443" -servername "$domain" -showcerts \
  </dev/null > "$certificate_file" 2>/dev/null; then
  fail 'TLS certificate handshake failed.'
fi
if ! openssl x509 -in "$certificate_file" -checkend 0 -checkhost "$domain" -noout >/dev/null 2>&1; then
  fail 'TLS certificate is expired or does not contain the production hostname.'
fi
pass 'TLS certificate'

headers_file="$(mktemp "${TMPDIR:-/tmp}/semcomp-smoke-headers.XXXXXXXX")"
register_temp_file "$headers_file"
curl --silent --show-error --head --max-time "$curl_timeout" "$base_url/" > "$headers_file" \
  || fail 'HTTPS security-header request failed.'
headers="$(<"$headers_file")"

grep -Eiq '^strict-transport-security:' <<< "$headers" \
  || fail 'Strict-Transport-Security header is missing.'
has_enforcement_csp=0
has_report_only_csp=0
if grep -Eiq '^content-security-policy:' <<< "$headers"; then
  has_enforcement_csp=1
fi
if grep -Eiq '^content-security-policy-report-only:' <<< "$headers"; then
  has_report_only_csp=1
fi
case "$csp_expected_mode" in
  enforcement)
    (( has_enforcement_csp == 1 )) || fail 'CSP enforcement header is missing.'
    (( has_report_only_csp == 0 )) || fail 'CSP report-only still replaces the enforcement response.'
    ;;
  report-only)
    (( has_report_only_csp == 1 )) || fail 'CSP report-only header is missing.'
    (( has_enforcement_csp == 0 )) || fail 'Report-only mode unexpectedly returned an enforcement header.'
    ;;
esac
if (( has_enforcement_csp == 1 )); then
  grep -Eiq "^content-security-policy:.*frame-ancestors[[:space:]]+'none'" <<< "$headers" \
    || fail 'CSP framing protection is missing.'
fi
grep -Eiq '^x-frame-options:[[:space:]]*deny' <<< "$headers" \
  || fail 'X-Frame-Options framing protection is missing.'
grep -Eiq '^x-content-type-options:[[:space:]]*nosniff' <<< "$headers" \
  || fail 'X-Content-Type-Options MIME protection is missing.'
grep -Eiq '^referrer-policy:' <<< "$headers" \
  || fail 'Referrer-Policy header is missing.'
grep -Eiq '^permissions-policy:' <<< "$headers" \
  || fail 'Permissions-Policy header is missing.'
pass 'security headers'

health_file="$(mktemp "${TMPDIR:-/tmp}/semcomp-smoke-health.XXXXXXXX")"
register_temp_file "$health_file"
health_status="$(curl --silent --show-error --output "$health_file" --write-out '%{http_code}' \
  --max-time "$curl_timeout" "$base_url/api/health")" \
  || fail 'API health request failed.'
[[ "$health_status" == '200' ]] || fail 'API health did not return HTTP 200.'
grep -Eiq '"status"[[:space:]]*:[[:space:]]*"ok"' "$health_file" \
  || fail 'API health did not report status ok.'
pass 'API health'

docs_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --max-time "$curl_timeout" "$base_url/api/docs")" \
  || fail 'API docs availability request failed.'
[[ "$docs_status" == '404' ]] || fail 'API docs endpoint is publicly available.'
pass 'API docs are unavailable'

for port in 22 3000 3001 5432; do
  if nc -z -w 3 "$domain" "$port" >/dev/null 2>&1; then
    fail "private port $port is publicly reachable."
  fi
done
pass 'private ports are not publicly reachable'

current_release="$(readlink -f -- "$current_link" 2>/dev/null)" \
  || fail 'Unable to resolve the current production release for log scanning.'
production_dir="$current_release/deploy/aws/production"
compose_file="$production_dir/compose.yml"
[[ -f "$compose_file" ]] || fail 'Production Compose file is missing for log scanning.'
[[ -f "$environment_file" ]] || fail 'Production environment file is missing for log scanning.'

log_file="$(mktemp "${TMPDIR:-/tmp}/semcomp-smoke-logs.XXXXXXXX")"
register_temp_file "$log_file"
if ! docker compose \
  --project-directory "$production_dir" \
  --project-name "$compose_project_name" \
  --file "$compose_file" \
  --env-file "$environment_file" \
  logs --no-color --since "$log_since" > "$log_file" 2>&1; then
  fail 'Unable to read production logs for the secret scan.'
fi

for sensitive_pattern in \
  '([0-9]{3}[.-]?){3}[0-9]{2}' \
  '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}' \
  'Bearer[[:space:]]+[A-Za-z0-9._~+/-]+' \
  '(^|[^[:alnum:]_])(cookie|set-cookie|access_token)[[:space:]]*[:=][[:space:]]*[^[:space:]}]' \
  "[\"'](password|passwd|senha)[\"'][[:space:]]*:[[:space:]]*[^,}]+" \
  '(password|passwd|senha)[[:space:]_-]*(=|:)[[:space:]]*[^[:space:]}]+'; do
  if grep -Eiq -- "$sensitive_pattern" "$log_file"; then
    fail 'Production logs contain a sensitive-data pattern.'
  fi
done
pass 'production logs contain no sensitive values'

participant_jar="$(mktemp "${TMPDIR:-/tmp}/semcomp-smoke-participant-cookie.XXXXXXXX")"
register_temp_file "$participant_jar"
participant_response="$(mktemp "${TMPDIR:-/tmp}/semcomp-smoke-participant-response.XXXXXXXX")"
register_temp_file "$participant_response"
participant_headers="$(mktemp "${TMPDIR:-/tmp}/semcomp-smoke-participant-headers.XXXXXXXX")"
register_temp_file "$participant_headers"
admin_jar="$(mktemp "${TMPDIR:-/tmp}/semcomp-smoke-admin-cookie.XXXXXXXX")"
register_temp_file "$admin_jar"
admin_response="$(mktemp "${TMPDIR:-/tmp}/semcomp-smoke-admin-response.XXXXXXXX")"
register_temp_file "$admin_response"
admin_headers="$(mktemp "${TMPDIR:-/tmp}/semcomp-smoke-admin-headers.XXXXXXXX")"
register_temp_file "$admin_headers"

check_cookie_attributes() {
  local cookie_headers="$1"
  local expected_max_age="$2"
  local cookie_line

  cookie_line="$(grep -Ei '^set-cookie:[[:space:]]*access_token[[:space:]]*=' "$cookie_headers" || true)"
  [[ -n "$cookie_line" ]] || fail 'Authenticated response did not set an access token cookie.'
  grep -Eiq ';[[:space:]]*secure([;[:space:]]|$)' <<< "$cookie_line" \
    || fail 'Authenticated cookie is missing Secure.'
  grep -Eiq ';[[:space:]]*httponly([;[:space:]]|$)' <<< "$cookie_line" \
    || fail 'Authenticated cookie is missing HttpOnly.'
  grep -Eiq ';[[:space:]]*samesite[[:space:]]*=[[:space:]]*lax([;[:space:]]|$)' <<< "$cookie_line" \
    || fail 'Authenticated cookie is missing SameSite=Lax.'
  grep -Eiq ";[[:space:]]*max-age[[:space:]]*=[[:space:]]*$expected_max_age([;[:space:]]|$)" <<< "$cookie_line" \
    || fail "Authenticated cookie does not have Max-Age=$expected_max_age."
}

read -r -p 'Admin CPF: ' admin_cpf || fail 'Admin CPF input was not provided.'
printf '\n'
read -r -p 'Admin email: ' admin_email || fail 'Admin email input was not provided.'
read -r -s -p 'Admin password: ' admin_password || fail 'Admin password input was not provided.'
printf '\n'
read -r -p 'Participant email: ' participant_email || fail 'Participant email input was not provided.'
read -r -s -p 'Participant password: ' participant_password || fail 'Participant password input was not provided.'
printf '\n'

participant_payload="$(printf '{"email":"%s","password":"%s"}' \
  "$(json_escape "$participant_email")" "$(json_escape "$participant_password")")"
if ! participant_login_status="$(printf '%s' "$participant_payload" | curl --silent --show-error \
  --request POST --output "$participant_response" --dump-header "$participant_headers" \
  --write-out '%{http_code}' --max-time "$curl_timeout" --cookie-jar "$participant_jar" \
  --header 'Content-Type: application/json' --data-binary @- "$base_url/api/auth/login")"; then
  fail 'Participant login request failed.'
fi
[[ "$participant_login_status" == '200' ]] || fail 'Participant login did not return HTTP 200.'
check_cookie_attributes "$participant_headers" 28800
participant_csrf="$(sed -n 's/.*"csrfToken"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$participant_response" | head -n1)"
[[ -n "$participant_csrf" ]] || fail 'Participant login did not return a CSRF token.'
participant_authenticated=1

participant_heartbeat_status="$(curl --silent --show-error --request POST --output /dev/null \
  --write-out '%{http_code}' --max-time "$curl_timeout" --cookie "$participant_jar" \
  --header "X-CSRF-Token: $participant_csrf" "$base_url/api/auth/heartbeat")" \
  || fail 'Participant heartbeat request failed.'
[[ "$participant_heartbeat_status" == '204' ]] || fail 'Participant heartbeat did not return HTTP 204.'
logout_session "$participant_jar" "$participant_csrf" \
  || fail 'Participant logout did not return HTTP 204.'
participant_authenticated=0
pass 'participant login and heartbeat'

admin_payload="$(printf '{"cpf":"%s","email":"%s","password":"%s"}' \
  "$(json_escape "$admin_cpf")" "$(json_escape "$admin_email")" "$(json_escape "$admin_password")")"
if ! admin_login_status="$(printf '%s' "$admin_payload" | curl --silent --show-error \
  --request POST --output "$admin_response" --dump-header "$admin_headers" \
  --write-out '%{http_code}' --max-time "$curl_timeout" --cookie-jar "$admin_jar" \
  --header 'Content-Type: application/json' --data-binary @- "$base_url/api/auth/admin/login")"; then
  fail 'Administrator login request failed.'
fi
[[ "$admin_login_status" == '200' ]] || fail 'Administrator login did not return HTTP 200.'
check_cookie_attributes "$admin_headers" 14400
admin_csrf="$(sed -n 's/.*"csrfToken"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$admin_response" | head -n1)"
[[ -n "$admin_csrf" ]] || fail 'Administrator login did not return a CSRF token.'
admin_authenticated=1

dashboard_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --max-time "$curl_timeout" --cookie "$admin_jar" "$base_url/api/admin/dashboard")" \
  || fail 'Administrator dashboard request failed.'
[[ "$dashboard_status" == '200' ]] || fail 'Administrator dashboard did not return HTTP 200.'
logout_session "$admin_jar" "$admin_csrf" \
  || fail 'Administrator logout did not return HTTP 204.'
admin_authenticated=0
unset admin_password participant_password admin_payload participant_payload
pass 'administrator login and dashboard'
