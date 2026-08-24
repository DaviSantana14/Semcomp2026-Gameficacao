#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
request_script="$script_dir/request-certificate.sh"
activate_script="$script_dir/activate-edge.sh"
renew_script="$script_dir/renew-certificate.sh"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

contains() {
  grep -Fq -- "$1" <<<"$2"
}

assert_contains() {
  contains "$1" "$2" || fail "$3"
}

assert_not_contains() {
  ! contains "$1" "$2" || fail "$3"
}

assert_file_equals() {
  cmp -s -- "$1" "$2" || fail "$3"
}

for required_file in "$request_script" "$activate_script" "$renew_script"; do
  [[ -f "$required_file" ]] || fail "missing production edge automation file: $required_file"
done

bash -n "$request_script"
bash -n "$activate_script"
bash -n "$renew_script"

test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT
bin_dir="$test_root/bin"
capture_dir="$test_root/capture"
release_root="$test_root/releases/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
shared_dir="$test_root/shared"
current_link="$test_root/current"
production_dir="$release_root/deploy/aws/production"
mkdir -p "$bin_dir" "$capture_dir" "$production_dir" "$shared_dir/nginx"

cp -- "$script_dir/../nginx-maintenance.conf" "$production_dir/nginx-maintenance.conf"
cp -- "$script_dir/../nginx-report-only.conf" "$production_dir/nginx-report-only.conf"
cp -- "$script_dir/../nginx-production.conf" "$production_dir/nginx-production.conf"
printf 'services:\n' > "$production_dir/compose.yml"
printf 'COMPOSE_PROJECT_NAME=semcomp-production\n' > "$shared_dir/production.env"
cp -- "$production_dir/nginx-maintenance.conf" "$shared_dir/nginx/active.conf"
ln -s -- "$release_root" "$current_link"

cat > "$bin_dir/dig" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "${DIG_RESULT:-203.0.113.10}"
EOF
chmod +x "$bin_dir/dig"

cat > "$bin_dir/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$DOCKER_CALLS"

case "$*" in
  *'test -s /etc/letsencrypt/live/gameficacao.semcomp.com.br/fullchain.pem'*|\
  *'test -s /etc/letsencrypt/live/gameficacao.semcomp.com.br/privkey.pem'*)
    [[ "${CERTS_READY:-0}" == '1' ]]
    ;;
  *'nginx -t'*)
    exit "${NGINX_TEST_EXIT:-0}"
    ;;
  *'certbot certonly'*)
    exit "${CERTBOT_EXIT:-0}"
    ;;
  *'certbot renew'*)
    exit "${CERTBOT_EXIT:-0}"
    ;;
esac

exit "${DOCKER_EXIT_CODE:-0}"
EOF
chmod +x "$bin_dir/docker"

cat > "$bin_dir/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$CURL_CALLS"
case "${CURL_MODE:-empty}" in
  enforcement)
    printf 'HTTP/1.1 200 OK\r\nContent-Security-Policy: default-src '\''self'\''\r\n\r\n'
    ;;
  report-only)
    printf 'HTTP/1.1 200 OK\r\nContent-Security-Policy-Report-Only: default-src '\''self'\''\r\n\r\n'
    ;;
esac
EOF
chmod +x "$bin_dir/curl"

cat > "$bin_dir/smoke.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf 'smoke\n' >> "$SMOKE_MARKER"
EOF
chmod +x "$bin_dir/smoke.sh"

export PATH="$bin_dir:$PATH"
export DOCKER_CALLS="$capture_dir/docker.calls"
export CURL_CALLS="$capture_dir/curl.calls"
export SMOKE_MARKER="$capture_dir/smoke.marker"
: > "$DOCKER_CALLS"
: > "$CURL_CALLS"
: > "$SMOKE_MARKER"

run_request() {
  local email_input="$1"
  shift
  printf '%s\n' "$email_input" | env \
    DEPLOY_ENV=production \
    CURRENT_LINK="$current_link" \
    SHARED_DIR="$shared_dir" \
    ENV_FILE="$shared_dir/production.env" \
    COMPOSE_PROJECT_NAME=semcomp-production \
    PRODUCTION_ELASTIC_IP=203.0.113.11 \
    "$@" bash "$request_script"
}

request_output=''
request_status=0
set +e
request_output="$(DIG_RESULT=203.0.113.10 run_request 'ops@example.com' 2>&1)"
request_status=$?
set -e
[[ "$request_status" -ne 0 ]] || fail 'certificate request succeeded before DNS matched the production EIP'
assert_contains 'DNS' "$request_output" 'DNS mismatch failure omitted its cause'
[[ ! -s "$DOCKER_CALLS" ]] || fail 'DNS mismatch started Docker before validation'

: > "$DOCKER_CALLS"
request_output=''
request_status=0
set +e
request_output="$(DIG_RESULT=203.0.113.11 run_request 'not-an-email' 2>&1)"
request_status=$?
set -e
[[ "$request_status" -ne 0 ]] || fail 'certificate request accepted an invalid ACME email'
assert_contains 'email' "$request_output" 'invalid email failure omitted its cause'
[[ ! -s "$DOCKER_CALLS" ]] || fail 'invalid email started Docker before validation'

: > "$DOCKER_CALLS"
request_output=''
request_status=0
set +e
request_output="$(DIG_RESULT=203.0.113.11 run_request '' 2>&1)"
request_status=$?
set -e
[[ "$request_status" -ne 0 ]] || fail 'certificate request accepted an empty ACME email'
assert_contains 'email' "$request_output" 'empty email failure omitted its cause'
[[ ! -s "$DOCKER_CALLS" ]] || fail 'empty email started Docker before validation'

: > "$DOCKER_CALLS"
request_output=''
request_status=0
set +e
request_output="$(DIG_RESULT=203.0.113.11 run_request 'ops@example.com' 2>&1)"
request_status=$?
set -e
[[ "$request_status" -eq 0 ]] || fail "valid certificate request failed: $request_output"
assert_not_contains 'ops@example.com' "$request_output" 'certificate success log exposed the ACME email'
request_docker_calls="$(<"$DOCKER_CALLS")"
assert_contains 'up -d --no-deps --no-build --force-recreate nginx' "$request_docker_calls" \
  'certificate request did not keep the maintenance Nginx active'
assert_contains 'certonly --webroot -w /var/www/certbot -d gameficacao.semcomp.com.br --cert-name gameficacao.semcomp.com.br' \
  "$request_docker_calls" 'Certbot did not use the required named webroot certificate flow'
assert_contains '-n --agree-tos --no-eff-email' "$request_docker_calls" \
  'Certbot did not use the required non-interactive agreement flags'
assert_contains '--email ops@example.com' "$request_docker_calls" 'Certbot did not receive the validated email'
assert_file_equals "$production_dir/nginx-maintenance.conf" "$shared_dir/nginx/active.conf" \
  'certificate request did not leave maintenance configuration active'

reset_edge_fixture() {
  cp -- "$production_dir/nginx-maintenance.conf" "$shared_dir/nginx/active.conf"
  : > "$DOCKER_CALLS"
  : > "$CURL_CALLS"
  : > "$SMOKE_MARKER"
}

run_activate() {
  env \
    DEPLOY_ENV=production \
    CURRENT_LINK="$current_link" \
    SHARED_DIR="$shared_dir" \
    ENV_FILE="$shared_dir/production.env" \
    COMPOSE_PROJECT_NAME=semcomp-production \
    SMOKE_TEST_SCRIPT="$bin_dir/smoke.sh" \
    "$@" bash "$activate_script"
}

reset_edge_fixture
activate_output=''
activate_status=0
set +e
activate_output="$(CERTS_READY=0 EDGE_MODE=report-only run_activate 2>&1)"
activate_status=$?
set -e
[[ "$activate_status" -ne 0 ]] || fail 'report-only activation succeeded without certificate files'
assert_contains 'Certificate' "$activate_output" 'missing certificate failure omitted its cause'
assert_file_equals "$production_dir/nginx-maintenance.conf" "$shared_dir/nginx/active.conf" \
  'missing certificate changed the active edge configuration'
assert_not_contains 'up -d --no-deps --no-build --force-recreate nginx' "$(<"$DOCKER_CALLS")" \
  'missing certificate recreated Nginx'

reset_edge_fixture
activate_output=''
activate_status=0
set +e
activate_output="$(CERTS_READY=1 NGINX_TEST_EXIT=1 EDGE_MODE=report-only run_activate 2>&1)"
activate_status=$?
set -e
[[ "$activate_status" -ne 0 ]] || fail 'report-only activation succeeded when nginx -t failed'
assert_contains 'Nginx' "$activate_output" 'nginx validation failure omitted its cause'
assert_file_equals "$production_dir/nginx-maintenance.conf" "$shared_dir/nginx/active.conf" \
  'failed report-only validation left an invalid active configuration'
[[ ! -s "$SMOKE_MARKER" ]] || fail 'browser smoke ran after report-only nginx validation failed'

reset_edge_fixture
run_activate CERTS_READY=1 NGINX_TEST_EXIT=0 EDGE_MODE=report-only >/dev/null
assert_file_equals "$production_dir/nginx-report-only.conf" "$shared_dir/nginx/active.conf" \
  'report-only activation did not atomically select report-only configuration'
assert_contains 'up -d --no-deps --no-build --force-recreate nginx' "$(<"$DOCKER_CALLS")" \
  'report-only activation did not recreate only Nginx'
assert_contains 'nginx -t' "$(<"$DOCKER_CALLS")" 'report-only activation did not validate Nginx'
assert_contains 'smoke' "$(<"$SMOKE_MARKER")" 'report-only activation skipped browser smoke'
assert_not_contains 'up -d --no-build --force-recreate api' "$(<"$DOCKER_CALLS")" \
  'report-only activation recreated the API'
assert_not_contains 'up -d --no-build --force-recreate web' "$(<"$DOCKER_CALLS")" \
  'report-only activation recreated the web service'

reset_edge_fixture
cp -- "$production_dir/nginx-report-only.conf" "$shared_dir/nginx/active.conf"
activate_output=''
activate_status=0
set +e
activate_output="$(EDGE_MODE=enforcement run_activate 2>&1)"
activate_status=$?
set -e
[[ "$activate_status" -ne 0 ]] || fail 'enforcement activation succeeded without explicit approval'
assert_contains 'approved' "$activate_output" 'enforcement approval failure omitted its cause'
assert_file_equals "$production_dir/nginx-report-only.conf" "$shared_dir/nginx/active.conf" \
  'missing enforcement approval changed the active edge configuration'
[[ ! -s "$DOCKER_CALLS" ]] || fail 'missing enforcement approval invoked Docker'

reset_edge_fixture
cp -- "$production_dir/nginx-report-only.conf" "$shared_dir/nginx/active.conf"
run_activate CERTS_READY=1 EDGE_MODE=enforcement SEMCOMP_CSP_ENFORCEMENT=approved CURL_MODE=enforcement >/dev/null
assert_file_equals "$production_dir/nginx-production.conf" "$shared_dir/nginx/active.conf" \
  'approved enforcement did not atomically select production configuration'
enforcement_docker_calls="$(<"$DOCKER_CALLS")"
assert_contains 'nginx -t' "$enforcement_docker_calls" 'enforcement did not validate Nginx'
assert_contains 'nginx -s reload' "$enforcement_docker_calls" 'enforcement did not reload Nginx'
assert_not_contains 'force-recreate' "$enforcement_docker_calls" \
  'enforcement restarted containers instead of reloading Nginx'
assert_contains '--head https://gameficacao.semcomp.com.br/' "$(<"$CURL_CALLS")" \
  'enforcement did not confirm the public CSP headers'

reset_edge_fixture
cp -- "$production_dir/nginx-report-only.conf" "$shared_dir/nginx/active.conf"
activate_output=''
activate_status=0
set +e
activate_output="$(CERTS_READY=1 CURL_MODE=report-only EDGE_MODE=enforcement SEMCOMP_CSP_ENFORCEMENT=approved run_activate 2>&1)"
activate_status=$?
set -e
[[ "$activate_status" -ne 0 ]] || fail 'enforcement activation accepted report-only headers'
assert_contains 'enforcement' "$activate_output" 'CSP enforcement failure omitted its cause'
assert_file_equals "$production_dir/nginx-report-only.conf" "$shared_dir/nginx/active.conf" \
  'failed CSP enforcement did not restore report-only configuration'

: > "$DOCKER_CALLS"
renew_output=''
renew_status=0
set +e
renew_output="$(env \
  CURRENT_LINK="$current_link" \
  SHARED_DIR="$shared_dir" \
  ENV_FILE="$shared_dir/production.env" \
  COMPOSE_PROJECT_NAME=semcomp-production \
  bash "$renew_script" 2>&1)"
renew_status=$?
set -e
[[ "$renew_status" -eq 0 ]] || fail "certificate renewal failed: $renew_output"
renew_docker_calls="$(<"$DOCKER_CALLS")"
assert_contains 'certbot renew' "$renew_docker_calls" 'renewal did not run certbot renew'
assert_contains 'nginx -t' "$renew_docker_calls" 'renewal did not validate Nginx'
assert_contains 'nginx -s reload' "$renew_docker_calls" 'renewal did not reload Nginx'
assert_not_contains ' compose down' "$renew_docker_calls" 'renewal stopped the Compose project'
assert_not_contains 'up -d' "$renew_docker_calls" 'renewal recreated containers'

: > "$DOCKER_CALLS"
renew_output=''
renew_status=0
set +e
renew_output="$(env \
  CURRENT_LINK="$current_link" \
  SHARED_DIR="$shared_dir" \
  ENV_FILE="$shared_dir/production.env" \
  COMPOSE_PROJECT_NAME=semcomp-production \
  bash "$renew_script" --dry-run unexpected 2>&1)"
renew_status=$?
set -e
[[ "$renew_status" -ne 0 ]] || fail 'renewal accepted unexpected extra arguments'
assert_contains 'only --dry-run' "$renew_output" 'extra-argument failure omitted its cause'
[[ ! -s "$DOCKER_CALLS" ]] || fail 'renewal invoked Docker before rejecting extra arguments'

: > "$DOCKER_CALLS"
renew_output=''
renew_status=0
set +e
renew_output="$(env \
  CURRENT_LINK="$current_link" \
  SHARED_DIR="$shared_dir" \
  ENV_FILE="$shared_dir/production.env" \
  COMPOSE_PROJECT_NAME=semcomp-production \
  bash "$renew_script" --dry-run 2>&1)"
renew_status=$?
set -e
[[ "$renew_status" -eq 0 ]] || fail "dry-run certificate renewal failed: $renew_output"
assert_contains 'certbot renew --dry-run' "$(<"$DOCKER_CALLS")" \
  'renew-certificate.sh --dry-run did not forward --dry-run to Certbot'

printf 'edge scripts test: ok\n'
